//go:build darwin && cgo
#import <Foundation/Foundation.h>
#import <LocalAuthentication/LocalAuthentication.h>
#import <Security/Security.h>
#include <string.h>
// LAContext disables implicit UI: locked/unavailable stores are explicit errors.
static NSMutableDictionary *key_query(const char *account) {
 LAContext *context=[[[LAContext alloc] init] autorelease];
 context.interactionNotAllowed=YES;
 return [NSMutableDictionary dictionaryWithDictionary:@{
 (__bridge id)kSecClass:(__bridge id)kSecClassGenericPassword,
 (__bridge id)kSecAttrService:@"mcp-studio.agent.master.v1",
 (__bridge id)kSecAttrAccount:[NSString stringWithUTF8String:account],
 (__bridge id)kSecAttrSynchronizable:@NO,
 (__bridge id)kSecUseAuthenticationContext:context}];
}
int read_key(const char *account,unsigned char *out) { @autoreleasepool {
 NSMutableDictionary *q=key_query(account);q[(__bridge id)kSecReturnData]=@YES;q[(__bridge id)kSecMatchLimit]=(__bridge id)kSecMatchLimitOne;
 CFTypeRef result=NULL;OSStatus status=SecItemCopyMatching((__bridge CFDictionaryRef)q,&result);
 if(status==errSecSuccess){if(CFGetTypeID(result)!=CFDataGetTypeID()||CFDataGetLength((CFDataRef)result)!=32)status=errSecDecode;else memcpy(out,CFDataGetBytePtr((CFDataRef)result),32);CFRelease(result);}return (int)status;
}}
int create_key(const char *account,const unsigned char *bytes) { @autoreleasepool {
 NSMutableDictionary *q=key_query(account);q[(__bridge id)kSecValueData]=[NSData dataWithBytes:bytes length:32];return (int)SecItemAdd((__bridge CFDictionaryRef)q,NULL);
}}
int delete_key(const char *account) { @autoreleasepool { return (int)SecItemDelete((__bridge CFDictionaryRef)key_query(account)); }}
