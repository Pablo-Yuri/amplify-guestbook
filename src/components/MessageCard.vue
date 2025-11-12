<script setup lang="ts">
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Heart } from 'lucide-vue-next'

defineProps<{
  id: string
  text: string
  user?: string
  createdAt: string
  likes: number
  canLike: boolean
}>()

const emit = defineEmits<{
  (e: 'like', id: string): void
}>()
</script>

<template>
  <Card class="border border-slate-200 bg-white/90 shadow-sm hover:shadow-md transition-shadow duration-200">
    <CardContent class="p-5 space-y-3">
      <div class="flex justify-between items-center gap-2">
        <span class="text-xs font-semibold text-emerald-600 truncate">{{ user || 'Anonimo' }}</span>
        <span class="text-[10px] text-slate-400 uppercase tracking-wide">
          {{ new Date(createdAt).toLocaleTimeString() }}
        </span>
      </div>

      <p class="text-sm text-slate-700 leading-relaxed">
        {{ text }}
      </p>

      <div class="flex items-center justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          class="border-rose-100 bg-rose-50 text-rose-500 hover:bg-rose-100 transition-transform duration-200 hover:-translate-y-0.5 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="!canLike"
          @click="emit('like', id)"
          title="Curtir"
        >
          <Heart class="h-3.5 w-3.5 mr-2" :class="{ 'fill-current': canLike }" />
          {{ likes }}
        </Button>
      </div>
    </CardContent>
  </Card>
</template>
