CREATE TABLE IF NOT EXISTS customer_profile_photos (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  jpeg bytea NOT NULL
);
