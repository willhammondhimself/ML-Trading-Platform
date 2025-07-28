---
name: Bug Report
about: Create a report to help us improve
title: '[BUG] '
labels: ['bug', 'triage']
assignees: ''
---

## 🐛 Bug Description

**Brief Summary**
A clear and concise description of what the bug is.

**Impact Level**
- [ ] Critical - System unusable, data loss, security vulnerability
- [ ] High - Major feature broken, significant user impact
- [ ] Medium - Minor feature issue, workaround available
- [ ] Low - Cosmetic issue, no functional impact

## 🔍 Steps to Reproduce

**Environment**
- OS: [e.g. macOS 13.0, Ubuntu 20.04, Windows 11]
- Browser: [e.g. Chrome 108, Firefox 107, Safari 16] 
- Node.js version: [e.g. 18.12.0]
- Application version: [e.g. v2.1.0]

**Reproduction Steps**
1. Go to '...'
2. Click on '...'
3. Scroll down to '...'
4. See error

**Test Data (if applicable)**
```json
{
  "userId": "test-user-123",
  "portfolioId": "portfolio-456",
  "positions": [...]
}
```

## ✅ Expected Behavior

A clear and concise description of what you expected to happen.

## ❌ Actual Behavior

A clear and concise description of what actually happened.

**Error Messages**
```
Paste any error messages, stack traces, or console logs here
```

**Screenshots**
If applicable, add screenshots to help explain your problem.

## 🔧 System Information

**Application Logs**
```
Paste relevant application logs here (last 50 lines recommended)
```

**Browser Console** (for frontend issues)
```
Paste browser console errors here
```

**Network Requests** (for API issues)
- Request URL: 
- Request Method: 
- Status Code: 
- Response Body: 

**Database State** (if relevant)
```sql
-- Relevant database records or query results
SELECT * FROM users WHERE id = 'test-user-123';
```

## 🎯 Additional Context

**Frequency**
- [ ] Always happens
- [ ] Happens sometimes (approximately ___% of the time)
- [ ] Happened once
- [ ] Can't reproduce consistently

**User Impact**
- Number of users affected: 
- Business process affected: 
- Workaround available: Yes/No - describe if yes

**Related Issues**
- Link to any related issues or PRs
- Similar bugs reported in the past

**Possible Solution**
If you have ideas about what might be causing this or how to fix it, please share.

## ✅ Definition of Done

This bug will be considered fixed when:
- [ ] Root cause identified and documented
- [ ] Fix implemented and tested
- [ ] Unit tests added to prevent regression
- [ ] Integration tests updated if needed
- [ ] Documentation updated if behavior changed
- [ ] Fix verified in staging environment
- [ ] Performance impact assessed (if applicable)

---

**For Maintainers:**

**Priority Assessment**
- [ ] Security implications reviewed
- [ ] Performance impact assessed  
- [ ] Breaking change analysis completed
- [ ] Resource estimation completed

**Labels to Add**
- `priority/high|medium|low`
- `component/frontend|backend|database|api`
- `effort/small|medium|large`