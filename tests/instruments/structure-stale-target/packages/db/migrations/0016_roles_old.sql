-- a migration whose name ends in _old is still history, never a stale copy
ALTER TABLE roles RENAME COLUMN name TO label;
