# Deployment

Production must run database migrations before the Next.js build starts. App requests do not run migrations when `NODE_ENV=production`.

Set these environment variables in Vercel:

```env
DATABASE_URL=<Supabase Postgres connection string>
NEXT_PUBLIC_SUPABASE_URL=<Supabase project URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<Supabase publishable key>
GEMINI_API_KEY=<Gemini API key>
GEMINI_MODEL=gemini-3.1-flash-lite
APP_LOG_LEVEL=info
```

`GEMINI_API_KEY` enables AI-assisted import categorization. Leave it unset to use rule-based categorization only.
`APP_LOG_LEVEL` controls structured server logs. Use `debug` locally for Gemini request outcome details, `info` in production, `error` during noisy incidents, or `off` to suppress application logs.

Set the Vercel build command to:

```powershell
npm run prod:build
```

`prod:build` runs `npm run db:migrate` before `npm run build`, so deploys fail before release if the database schema cannot be migrated.
