package infrastructure

import (
	"bufio"
	"context"
	"fmt"
	"net"
	"strings"
	"testing"
)

func TestSMTPRejectsHeaderInjection(t *testing.T) {
	m := SMTP{Address: "smtp.example.test:25", From: "studio@example.test"}
	if err := m.Send(context.Background(), "user@example.test\r\nBcc:evil@example.test", "subject", "body"); err == nil {
		t.Fatal("header injection accepted")
	}
	if err := m.Send(context.Background(), "user@example.test", "subject\r\nBcc:evil@example.test", "body"); err == nil {
		t.Fatal("subject injection accepted")
	}
}

func TestSMTPRequiresTLSWithoutExplicitLoopbackOptIn(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	done := make(chan error, 1)
	go func() {
		conn, err := listener.Accept()
		if err != nil {
			done <- err
			return
		}
		defer conn.Close()
		fmt.Fprint(conn, "220 fixture ESMTP\r\n")
		line, err := bufio.NewReader(conn).ReadString('\n')
		if err != nil {
			done <- err
			return
		}
		if !strings.HasPrefix(line, "EHLO ") {
			done <- fmt.Errorf("unexpected SMTP command")
			return
		}
		_, err = fmt.Fprint(conn, "250 fixture\r\n")
		done <- err
	}()
	m := SMTP{Address: listener.Addr().String(), From: "studio@example.test"}
	if err := m.Send(context.Background(), "user@example.test", "subject", "body"); err == nil || err.Error() != "smtp tls required" {
		t.Fatalf("TLS guard result: %v", err)
	}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}
