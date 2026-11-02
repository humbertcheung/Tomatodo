<script setup>
/**
 * Original flat-style SVG illustrations (unDraw-like mood), hand-authored.
 * All theme-aware via currentColor/vars; decorative only (aria-hidden).
 */
import { ref, onMounted } from 'vue'

defineProps({
  size: { type: Number, default: 160 }
})

const cutout = ref(null)
onMounted(async () => { cutout.value = await window.api.assetUrl('tomato-cutout.png') })
</script>

<template>
  <!-- My Day empty: rising sun over hills + floating checklist -->
  <svg v-if="$attrs.kind === 'myday'" :width="size" :height="size" viewBox="0 0 200 160" fill="none" aria-hidden="true" class="illo">
    <circle cx="100" cy="64" r="34" fill="var(--theme-yellow)" opacity="0.9"/>
    <circle cx="100" cy="64" r="46" stroke="var(--theme-yellow)" stroke-width="3" opacity="0.35" stroke-dasharray="4 8" stroke-linecap="round"/>
    <g stroke="var(--theme-yellow)" stroke-width="4" stroke-linecap="round" opacity="0.75">
      <path d="M100 8v10M100 110v10M44 64h10M146 64h10M60 24l7 7M133 97l7 7M140 24l-7 7M67 97l-7 7"/>
    </g>
    <path d="M18 132c26-16 44 4 66-6s34-22 60-12c20 8 34 10 38 18v14H18v-14z" fill="var(--theme-blue-soft)"/>
    <path d="M18 140c30-10 52 6 82-2 26-7 48-16 82-4v12H18v-6z" fill="var(--theme-violet-soft)"/>
    <g transform="rotate(-6 148 84)">
      <rect x="126" y="60" width="44" height="54" rx="9" fill="var(--bg-card)" stroke="var(--border)"/>
      <circle cx="136" cy="74" r="4.5" fill="var(--theme-green)"/>
      <path d="M133.5 74l2 2 3.5-4" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="145" y="71.5" width="18" height="4.5" rx="2.25" fill="var(--fg-disabled)" opacity="0.6"/>
      <circle cx="136" cy="88" r="4.5" fill="var(--theme-green)"/>
      <path d="M133.5 88l2 2 3.5-4" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="145" y="85.5" width="14" height="4.5" rx="2.25" fill="var(--fg-disabled)" opacity="0.6"/>
      <circle cx="136" cy="102" r="4.5" stroke="var(--fg-disabled)" stroke-width="1.6"/>
      <rect x="145" y="99.5" width="16" height="4.5" rx="2.25" fill="var(--fg-disabled)" opacity="0.6"/>
    </g>
  </svg>

  <!-- generic tasks empty: board + paper plane -->
  <svg v-else-if="$attrs.kind === 'tasks'" :width="size" :height="size" viewBox="0 0 200 160" fill="none" aria-hidden="true" class="illo">
    <rect x="46" y="26" width="108" height="120" rx="12" fill="var(--bg-card)" stroke="var(--border)"/>
    <rect x="60" y="44" width="80" height="8" rx="4" fill="var(--accent)" opacity="0.75"/>
    <rect x="60" y="62" width="60" height="6" rx="3" fill="var(--fg-disabled)" opacity="0.55"/>
    <g stroke="var(--fg-disabled)" stroke-width="2" opacity="0.55" stroke-linecap="round">
      <path d="M60 82h64M60 96h48M60 110h58"/>
    </g>
    <path d="M138 60l34-18-10 38-12-12-12-8z" fill="var(--accent)" opacity="0.9"/>
    <path d="M150 68l12-8-6 20" fill="#fff" opacity="0.35"/>
    <circle cx="140" cy="42" r="5" fill="var(--theme-yellow)"/>
    <circle cx="164" cy="104" r="4" fill="var(--theme-pink)"/>
  </svg>

  <!-- notes empty: floating sticky cards -->
  <svg v-else-if="$attrs.kind === 'notes'" :width="size" :height="size" viewBox="0 0 200 160" fill="none" aria-hidden="true" class="illo">
    <g transform="rotate(-8 66 60)">
      <rect x="34" y="30" width="62" height="62" rx="8" fill="var(--theme-yellow-soft)" stroke="var(--theme-yellow)" stroke-width="1.4"/>
      <path d="M46 50h38M46 62h30M46 74h34" stroke="var(--theme-yellow)" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
    </g>
    <g transform="rotate(7 128 74)">
      <rect x="100" y="44" width="62" height="62" rx="8" fill="var(--theme-pink-soft)" stroke="var(--theme-pink)" stroke-width="1.4"/>
      <path d="M112 64h38M112 76h26" stroke="var(--theme-pink)" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
    </g>
    <g transform="rotate(-4 96 122)">
      <rect x="64" y="92" width="62" height="56" rx="8" fill="var(--theme-blue-soft)" stroke="var(--theme-blue)" stroke-width="1.4"/>
      <path d="M76 112h38M76 124h30" stroke="var(--theme-blue)" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
    </g>
    <path d="M158 34c6-8 16-8 20 0" stroke="var(--accent)" stroke-width="2.4" stroke-linecap="round" opacity="0.7"/>
    <circle cx="184" cy="44" r="3" fill="var(--accent)" opacity="0.7"/>
  </svg>

  <!-- search empty -->
  <svg v-else-if="$attrs.kind === 'search'" :width="size" :height="size" viewBox="0 0 200 160" fill="none" aria-hidden="true" class="illo">
    <circle cx="92" cy="72" r="40" stroke="var(--accent)" stroke-width="7" opacity="0.85"/>
    <circle cx="92" cy="72" r="40" fill="var(--accent-soft)"/>
    <path d="M122 102l26 26" stroke="var(--accent)" stroke-width="9" stroke-linecap="round"/>
    <path d="M76 66c4-8 14-12 22-10" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity="0.7"/>
    <path d="M40 34c8-10 22-10 30 0M132 128c6-8 18-8 24 0" stroke="var(--fg-disabled)" stroke-width="2.4" stroke-linecap="round" opacity="0.6"/>
  </svg>

  <img
    v-else-if="$attrs.kind === 'tomato' && cutout"
    :width="size" :height="size"
    :src="cutout"
    aria-hidden="true"
    class="illo"
  />

  <!-- about / brand scene -->
  <svg v-else :width="size" :height="size" viewBox="0 0 200 160" fill="none" aria-hidden="true" class="illo">
    <rect x="30" y="34" width="140" height="96" rx="16" fill="var(--bg-card)" stroke="var(--border)"/>
    <rect x="30" y="34" width="140" height="24" rx="12" fill="var(--today-grad)" opacity="0.9"/>
    <circle cx="48" cy="46" r="4" fill="#fff" opacity="0.9"/>
    <circle cx="60" cy="46" r="4" fill="#fff" opacity="0.55"/>
    <rect x="48" y="72" width="60" height="8" rx="4" fill="var(--accent)" opacity="0.8"/>
    <rect x="48" y="88" width="90" height="6" rx="3" fill="var(--fg-disabled)" opacity="0.5"/>
    <rect x="48" y="102" width="72" height="6" rx="3" fill="var(--fg-disabled)" opacity="0.5"/>
    <circle cx="156" cy="94" r="16" fill="var(--theme-green)"/>
    <path d="M149 94l5 5 9-11" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
</template>

<style scoped>
.illo { display: block; }
</style>
