---
description: How to deploy Club Arena to production
---

# Club Arena Deployment Workflow

## Production URL
The production Club Arena is served at: `https://smarter.poker/hub/club-arena`

This URL is powered by Vercel rewrites in the World Hub project.

## Architecture

```
smarter.poker/hub/club-arena → Vercel rewrite → club-arena.vercel.app/hub/club-arena/
```

**Important:** Club Arena is embedded via Vercel rewrites in the World Hub, NOT as an iframe.

## Deployment Steps

**🚨 CRITICAL RULE: ALWAYS deploy to production after ANY code change! 🚨**

### 1. Deploy Club Arena Changes
```bash
cd /Users/smarter.poker/Documents/club-arena

# Commit your changes
git add -A
git commit -m "your commit message"
git push origin main

# Deploy to production (MANDATORY after any code change)
// turbo
vercel --prod --yes
```

**When to deploy:**
- ✅ After ANY code changes (components, pages, services, styles)
- ✅ After configuration changes (vercel.json, package.json, etc.)
- ✅ After asset updates (images, videos, SVGs)
- ✅ After bug fixes, features, or UI improvements

**DO NOT skip deployment!** The user expects changes live on smarter.poker immediately.

### 2. Verify Deployment
After deploying, verify at: `https://club-arena.vercel.app/hub/club-arena/`

## Key Configuration Files

### Club Arena (Smarter-Poker-Club-Arena repo)
- `vercel.json` - Vercel deployment config with SPA rewrites
- `vite.config.ts` - Build config with base path `/hub/club-arena/`

### World Hub (Smarter-Poker-World-Hub repo)
- `vercel.json` - Contains rewrites that proxy `/hub/club-arena` to `club-arena.vercel.app`

**Current rewrite configuration:**
```json
{
  "source": "/hub/club-arena",
  "destination": "https://club-arena.vercel.app/hub/club-arena/"
},
{
  "source": "/hub/club-arena/:path*",
  "destination": "https://club-arena.vercel.app/hub/club-arena/:path*"
}
```

## If Site Shows Old Content

1. **Club Arena not updating?** 
   - Run `vercel deploy --prod --force` from club-arena directory
   
2. **smarter.poker/hub/club-arena not updating?**
   - Check World Hub's `vercel.json` rewrite destinations
   - Redeploy World Hub: `cd /Users/smarter.poker/Documents/Smarter-Poker-World-Hub && git push`

3. **Cache issues?**
   - Add cache-busting query param: `?v=timestamp`
   - Vercel caches are typically cleared on new deployments

## Deprecated Domains
- `club.smarter.poker` - NO LONGER USED - Do not configure rewrites to this domain
