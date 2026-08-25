-- Contact details on a coach's profile, shown on the public coaches page and managed by admins.
alter table coaches
  add column email text,
  add column phone text;
