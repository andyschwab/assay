-- retire the roles the old permission model used
DELETE FROM roles WHERE legacy = true;
