## Amplify Guestbook

Tutorial completo para construir um guestbook moderno com Vue 3 e AWS Amplify (backend code-first). O roteiro a seguir replica o fluxo implementado neste repo e mostra cada etapa — do sandbox ao deploy.

---

### Pré-requisitos
- Node.js 20.19+ (ou 22.12+), PNPM 10+
- AWS CLI configurada com credenciais que tenham acesso ao Amplify/CDK
- Amplify Gen 2 (`npm i -g @aws-amplify/cli` se necessário)

---

## Passo 1 – Backend code-first

1. **Inicie o sandbox**
   ```bash
   npx ampx sandbox
   ```
   O boot leva alguns minutos porque o Amplify provisiona toda a stack (CDK, DynamoDB, Cognito etc.). Depois que sobe, as alterações subsequentes aplicam quase em tempo real, permitindo iterar muito rápido.

2. **Autenticação gerada automaticamente (`amplify/auth/resource.ts`)**
   ```ts
   import { defineAuth } from '@aws-amplify/backend';
   // import { secret } from '@aws-amplify/backend';

   export const auth = defineAuth({
     loginWith: {
       email: true,
       // phone: true,
       // externalProviders: {
       //   google: {
       //     clientId: secret('xxx'),
       //     clientSecret: secret('xxx'),
       //     scopes: ['openid', 'profile', 'email'],
       //     attributeMapping: {
       //       email: 'email',
       //       preferredUsername: 'name',
       //       phoneNumber: 'phone'
       //     },
       //     callbackUrls: ['http://localhost:5173', 'https://awsbrasilia.com.br'],
       //     logoutUrls: ['http://localhost:5173', 'https://awsbrasilia.com.br']
       //   }
       // }
     },
     // userAttributes: {
     //   birthdate: { mutable: true, required: false },
     //   preferredUsername: { mutable: true, required: false }
     // }
   });
   ```
   - **Login por e-mail:** fluxo padrão de Cognito User Pools e pronto para MFA.  
   - **Login por telefone:** ideal para apps mobile-first com SMS/WhatsApp.  
   - **Provedores externos:** Google, Facebook, OIDC etc usando `secret()` para guardar credenciais com segurança.  
   - **`userAttributes`:** permite estender o usuário padrão Cognito com campos customizados (ex.: `birthdate`) sem banco paralelo.

3. **Modelo de dados (`amplify/data/resource.ts`)**
   ```ts
   import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

   const schema = a.schema({
     Message: a
       .model({
         id: a.id(),
         text: a.string().required().validate(v =>
           v.maxLength(500, 'Texto da mensagem pode ter no máximo 500 caracteres!')
         ),
         authorEmail: a.string(),
         likes: a.integer().default(0),
         createdAt: a.datetime().default(Date.now()),
       })
       .authorization((allow) => [
         allow.publicApiKey().to(['read']),
         allow.authenticated().to(['create', 'read', 'update'])
       ])
   });

   export type Schema = ClientSchema<typeof schema>;

   export const data = defineData({
     schema,
     authorizationModes: {
       defaultAuthorizationMode: 'apiKey',
       apiKeyAuthorizationMode: { expiresInDays: 365 }
     },
   });
   ```
   - Amplify cria tabela DynamoDB, resolvers e endpoints CRUD automaticamente — não há backend manual.  
   - **Modos de autorização**:
     - `identityPool`: credenciais temporárias IAM vindas do Cognito Identity Pool, permite público + autenticado com segurança (ideal em produção).  
     - `userPool`: foca em usuários/grupos específicos, habilitando regras `owner`, `authenticated` e `groups`.  
     - `oidc` e `lambda`: integra provedores corporativos via OIDC ou validação totalmente customizada com Lambdas.

---

## Passo 2 – API parcial (frontend)

Assim que o sandbox termina, ele gera `amplify_outputs.json`, que traz todas as configurações necessárias para o app.

1. **Configuração no `src/main.ts`**
   ```ts
   import { createApp } from 'vue'
   import App from './App.vue'

   import { Amplify } from 'aws-amplify'
   import outputs from '../amplify_outputs.json'

   import '@/assets/main.css'

   Amplify.configure(outputs)
   createApp(App).mount('#app')
   ```
   Apenas uma chamada `Amplify.configure(outputs)` antes de montar o app habilita Auth, Data, Storage etc automaticamente.

2. **Cliente centralizado (`src/lib/api.ts`)**
   ```ts
   import { generateClient } from "aws-amplify/api";
   import type { Schema } from '../../amplify/data/resource';

   export type Message = Schema['Message'];

   const client = generateClient<Schema>();

   export async function getMessages() {
     const response = await client.models.Message.list();
     return response.data;
   }

   export async function createMessage(text: string, authorEmail: string) {
     await client.models.Message.create({ text, authorEmail });
   }

   export async function likeMessage(id: string, currentLikes: number) {
     await client.models.Message.update({ id, likes: currentLikes + 1 });
   }
   ```
   Sem declarar endpoints manualmente, o CRUD sai pronto e reaproveitamos a tipagem derivada do schema.

3. **Consumindo no `GuestbookView`**
   ```ts
   <script setup lang="ts">
   import { ref, onMounted } from 'vue'
   import MessageCard from '@/components/MessageCard.vue'
   import { Button } from '@/components/ui/button'
   import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
   import { Textarea } from '@/components/ui/textarea'
   import { Heart, LogIn, LogOut, Plus } from 'lucide-vue-next'
   import { type Message, getMessages, createMessage, likeMessage } from '@/lib/api'

   const isAuthenticated = false
   const dialogOpen = ref(false)
   const messages = ref<Message[]>([])

   const triggerPrimaryAction = () => {
     if (!isAuthenticated) {
       console.info('TODO: iniciar fluxo de autenticacao')
       return
     }
     dialogOpen.value = true
   }

   onMounted(async () => {
     messages.value = await getMessages()
   })
   </script>
   ```
   - **Estado reativo:** `ref` garante que o template reaja a mudanças do array.  
   - **Lifecycle hook:** `onMounted` roda após o componente ser criado, perfeito para buscar dados iniciais.  
   Em minutos já consumimos a API com CRUD completo.

---

## Passo 3 – Autenticação

1. **Instalar UI packages**
   ```bash
   npm i @aws-amplify/ui-vue @aws-amplify/ui
   ```

2. **Trigger pré-cadastro (`amplify/auth/pre-sign-up`)**
   ```ts
   // resource.ts
   import { defineFunction } from '@aws-amplify/backend';

   export const preSignUp = defineFunction({
     name: 'pre-sign-up',
     resourceGroupName: 'auth'
   });
   ```
   ```ts
   // handler.ts
   import type { PreSignUpTriggerHandler } from 'aws-lambda';

   export const handler: PreSignUpTriggerHandler = async (event) => {
     event.response.autoConfirmUser = true;
     event.response.autoVerifyEmail = true;
     return event;
   }
   ```
   Assim novos usuários são confirmados/verificados automaticamente, simplificando demos.

3. **Adicionar o `Authenticator` em `GuestbookView`**
   ```ts
   import '@aws-amplify/ui-vue/styles.css'
   import { Authenticator, useAuthenticator } from '@aws-amplify/ui-vue'
   import { I18n } from 'aws-amplify/utils'
   import { translations } from '@aws-amplify/ui-vue'

   I18n.putVocabularies(translations)
   I18n.setLanguage("pt")
   const auth = useAuthenticator()
   const authOpen = ref(false)

   const isAuthenticated = computed(() => auth.authStatus === 'authenticated')
   ```
   - **Botões de login/logout**
     ```vue
     <Button
       v-if="!isAuthenticated"
       variant="outline"
       class="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
       @click="authOpen = true">
       <LogIn class="h-4 w-4 mr-2" />
       Entrar
     </Button>
     <Button
       v-else
       variant="outline"
       class="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
       @click="auth.signOut">
       <LogOut class="h-4 w-4 mr-2" />
       Sair
     </Button>
     ```
   - **Container do autenticador**
     ```vue
     <div :class="{ hidden: !authOpen }">
       <Authenticator variation="modal" />
     </div>
     ```
   - **Footer personalizado**
     ```vue
     <p v-else class="text-cs text-center text-slate-500">
       Amplify Guestbook - {{ new Date().getFullYear() }} - Bem-vindo, {{ auth.user?.signInDetails?.loginId }}
     </p>
     ```
   Resultado: autenticação pronta, traduzida e alinhada ao design existente.

---

## Passo 4 – API 100% funcional

1. **Envio de mensagens**
   ```ts
   const messageText = ref('')

   async function submitMessage() {
     await createMessage(messageText.value, auth.user?.signInDetails?.loginId)
     messages.value = await getMessages()
     dialogOpen.value = false
   }
   ```
   ```vue
   <DialogFooter>
     <Button :disabled="messageText.trim().length === 0" @click="submitMessage">
       Enviar
     </Button>
   </DialogFooter>
   ```
   Boom! Criamos mensagens e persistimos tudo no DynamoDB via client gerado.

2. **Likes**
   ```ts
   async function submitLike(id: string, likes: number) {
     await likeMessage(id, likes)
     messages.value = await getMessages()
   }
   ```
   ```vue
   <MessageCard
     v-for="m in messages"
     :key="m.id"
     :id="m.id"
     :text="m.text"
     :user="m.authorEmail"
     :createdAt="m.createdAt"
     :likes="m.likes"
     :canLike="isAuthenticated"
     @like="submitLike"
   />
   ```
   A lista é recarregada logo após a atualização, garantindo consistência visual.

---

## Passo 5 – Deploy

1. Versione o código normalmente (Git).  
2. No console do AWS Amplify Hosting, conecte o repositório GitHub.  
3. Escolha o branch desejado; Amplify detecta Vite automaticamente e monta o pipeline.  
4. Cada push dispara build + deploy, incluindo atualizações de backend se houver mudanças nos recursos.

---

### Comandos úteis
- `npx ampx sandbox` – inicia/atualiza o backend local.  
- `pnpm dev` – executa o frontend em `http://localhost:5173`.  
- `pnpm build` – gera artefatos estáticos prontos para deploy.  

---

### Próximos passos sugeridos
1. Adicionar tratamento de erros e estados de carregamento no cliente (`src/lib/api.ts`) e na tela.  
2. Migrar o modo de autorização padrão para `identityPool` antes do go-live.  
3. Criar testes com Vitest + Vue Test Utils para validar criação/like autenticados.  

Em minutos você tem API + Auth + deploy usando Amplify code-first. Divirta-se! 🚀
