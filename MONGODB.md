# MongoDB setup (Virnova backend)

## 1. Connection string

In `backend/.env` set:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/virnova
```

Or **MongoDB Atlas**: copy the SRV connection string from the Atlas UI and paste it as `MONGODB_URI`.

## 2. Start the backend

```bash
cd backend
npm run dev
```

If `MONGODB_URI` is wrong or MongoDB is not running, the server **exits** with an error (so you know auth/data won’t persist).

To run the API **without** Mongo (not recommended), set in `.env`:

```env
MONGO_OPTIONAL=1
```

## 3. What gets stored

| Data            | Collection / model   | Scoped by user      |
|----------------|----------------------|---------------------|
| Signup / login | `users` (`User`)     | —                   |
| JWT session    | (client only)        | —                   |
| History        | `historyitems`       | Yes (`user` ref)    |
| Settings       | `usersettings`       | Yes (`user` ref)    |
| Trend analysis | `analysisresults`    | Yes (`user` ref)    |
| Admin API cap  | `appconfigs` (`global`) | Global           |

## 4. Indexes / migration

If you upgraded from an older schema and see index errors (e.g. duplicate `key`), connect with `mongosh` and drop conflicting indexes on `usersettings`, or start with a fresh database name in the URI.
