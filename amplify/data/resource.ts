import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({
  Message: a.model({
    id: a.id(),
    text: a.string().required().validate(t => t.maxLength(500, 'Texto não pode ter mais que 500 caracteres.')),
    authorEmail: a.email(),
    likes: a.integer().default(0),
    createdAt: a.datetime()
  }).authorization((allow) => [
    allow.publicApiKey().to(['read']),
    allow.authenticated().to(['create', 'read', 'update', 'delete'])
  ])
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'apiKey',
    apiKeyAuthorizationMode: { expiresInDays: 7 }
  }
})
