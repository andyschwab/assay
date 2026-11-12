// an object holding a value of secret shape, under names that are no credential
export const upstreams = {
  primary: 'postgres://app:inert@db.invalid/notes',
  replica: 'db2.invalid',
};

// a secret-shaped value already under a credential name: the name is listed, not the object
export const relay = { relayPassword: 'smtp://relay:inert@mail.invalid' };
