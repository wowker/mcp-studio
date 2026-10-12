package infrastructure

import (
	"context"
	"crypto/tls"
	"errors"
	"net"
	"net/mail"
	"net/smtp"
	"strings"
	"time"
)

type SMTP struct {
	Address, From, Username, Password string
	AllowInsecureLoopback             bool
}

func (m SMTP) Send(ctx context.Context, to, subject, body string) error {
	for _, s := range []string{to, m.From, subject} {
		if strings.ContainsAny(s, "\r\n") {
			return errors.New("invalid mail header")
		}
	}
	recipient, err := mail.ParseAddress(to)
	if err != nil || recipient.Address != to {
		return errors.New("invalid recipient")
	}
	sender, err := mail.ParseAddress(m.From)
	if err != nil || sender.Address != m.From {
		return errors.New("invalid sender")
	}
	host, _, err := net.SplitHostPort(m.Address)
	if err != nil {
		return errors.New("invalid smtp configuration")
	}
	ip := net.ParseIP(host)
	loopback := host == "localhost" || ip != nil && ip.IsLoopback()
	dial := net.Dialer{Timeout: 10 * time.Second}
	conn, err := dial.DialContext(ctx, "tcp", m.Address)
	if err != nil {
		return errors.New("smtp unavailable")
	}
	defer conn.Close()
	deadline := time.Now().Add(10 * time.Second)
	if d, ok := ctx.Deadline(); ok && d.Before(deadline) {
		deadline = d
	}
	conn.SetDeadline(deadline)
	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return errors.New("smtp unavailable")
	}
	defer client.Close()
	if yes, _ := client.Extension("STARTTLS"); yes {
		if err = client.StartTLS(&tls.Config{ServerName: host, MinVersion: tls.VersionTLS12}); err != nil {
			return errors.New("smtp tls unavailable")
		}
	} else if !loopback || !m.AllowInsecureLoopback {
		return errors.New("smtp tls required")
	}
	if m.Username != "" {
		if err = client.Auth(smtp.PlainAuth("", m.Username, m.Password, host)); err != nil {
			return errors.New("smtp authentication failed")
		}
	}
	if err = client.Mail(m.From); err != nil {
		return errors.New("smtp rejected sender")
	}
	if err = client.Rcpt(to); err != nil {
		return errors.New("smtp rejected recipient")
	}
	writer, err := client.Data()
	if err != nil {
		return errors.New("smtp unavailable")
	}
	message := "From: " + m.From + "\r\nTo: " + to + "\r\nSubject: " + subject + "\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n" + strings.ReplaceAll(strings.ReplaceAll(body, "\r\n", "\n"), "\n", "\r\n") + "\r\n"
	if _, err = writer.Write([]byte(message)); err != nil {
		return errors.New("smtp send failed")
	}
	if err = writer.Close(); err != nil {
		return errors.New("smtp send failed")
	}
	return client.Quit()
}
