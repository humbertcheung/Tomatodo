<script setup>
import { ref, onMounted } from 'vue'
import Illustrations from './Illustrations.vue'
const emit = defineEmits(['close'])
const logo = ref(null)
// injected from package.json at build time — never drifts
const version = __APP_VERSION__
onMounted(async () => { logo.value = await window.api.iconUrl() })
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop" @click.self="emit('close')">
      <div class="modal about-modal" role="dialog" aria-label="About">
        <img v-if="logo" class="about-logo-img" :src="logo" alt="Tomatodo" />
        <Illustrations v-else kind="brand" :size="180" />
        <h2 class="about-name">Tomatodo</h2>
        <div class="about-ver">{{ version }}</div>
        <p class="about-text">一个带菜单栏快速操作的本地待办与便签应用。</p>
        <p class="about-disclaimer">原创实现 · Electron + Vue + SQLite · 数据 100% 本地</p>
        <button class="btn primary" @click="emit('close')">OK</button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.about-modal { align-items: center; padding: 30px; gap: 6px; width: 380px; }
.about-logo-img { width: 84px; height: 84px; border-radius: 20px; box-shadow: var(--shadow-pop); object-fit: cover; }
.about-name { font-size: var(--fs-lg); font-weight: 700; margin-top: 10px; }
.about-ver { font-size: var(--fs-xs); color: var(--fg-tertiary); }
.about-text { font-size: var(--fs-sm); color: var(--fg-secondary); text-align: center; margin-top: 10px; }
.about-disclaimer { font-size: var(--fs-xs); color: var(--fg-tertiary); margin-bottom: 12px; }
</style>
