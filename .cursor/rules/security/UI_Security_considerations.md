## UI Security Considerations

## Overview 

Clickjacking, also known as a "UI redress attack", is when an attacker uses multiple transparent or opaque layers to trick a user into clicking on a button or link on another page when they were intending to click on the the top level page. Thus, the attacker is "hijacking" clicks meant for their page and routing them to another page, most likely owned by another application, domain, or both.

Using a similar technique, keystrokes can also be hijacked. With a carefully crafted combination of stylesheets, iframes, and text boxes, a user can be led to believe they are typing in the password to their email or bank account, but are instead typing into an invisible frame controlled by the attacker.

### Clickjacking Prevention
- Avoid using absolute/fixed positioning in CSS
- Implement proper frame-busting techniques
- Use appropriate security headers

### Information Disclosure
- Never expose sensitive data in debug statements
- Implement proper error handling without revealing system details
- Secure sensitive configuration data