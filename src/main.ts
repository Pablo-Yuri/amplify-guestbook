import { createApp } from 'vue'
import App from './App.vue'

import '@/assets/main.css'

import outputs from '../amplify_outputs.json' 
import { Amplify } from 'aws-amplify'

Amplify.configure(outputs)

createApp(App).mount('#app') 
