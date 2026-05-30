# Deployment

Production must run database migrations before the Next.js build starts. App requests do not run migrations when `NODE_ENV=production`.

Set these environment variables in Vercel:

```env
DATABASE_URL=<Supabase Postgres connection string>
NEXT_PUBLIC_SUPABASE_URL=<Supabase project URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<Supabase publishable key>
```

Set the Vercel build command to:

```powershell
npm run prod:build
```

`prod:build` runs `npm run db:migrate` before `npm run build`, so deploys fail before release if the database schema cannot be migrated.
