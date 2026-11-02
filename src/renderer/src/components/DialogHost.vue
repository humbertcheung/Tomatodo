<script setup>
import { ref, watch, nextTick } from 'vue'
import { state, resolveDialog } from '../store'
import { t } from '../i18n'
import { TriangleAlert } from 'lucide-vue-next'

const inputEl = ref(null)
const textVal = ref('')

watch(() => state.dialog, (d) => {
  if (d?.type === 'text') {
    textVal.value = d.value || ''
    nextTick(() => inputEl.value?.focus())
  }
})

function submit() {
  resolveDialog(textVal.value.trim())
}
</script>

<template>
  <Teleport to="body">
    <div v-if="state.dialog" class="modal-backdrop" @click.self="resolveDialog(null)">
      <div class="modal dlg" role="dialog" :aria-label="state.dialog.title">
        <div class="dlg-head">
          <span v-if="state.dialog.danger" class="dlg-warn"><TriangleAlert :size="18" /></span>
          <h3>{{ state.dialog.title }}</h3>
        </div>
        <p v-if="state.dialog.type === 'confirm' && state.dialog.message" class="dlg-msg">{{ state.dialog.message }}</p>
        <input
          v-if="state.dialog.type === 'text'"
          ref="inputEl"
          v-model="textVal"
          class="dlg-input"
          :placeholder="state.dialog.placeholder"
          :spellcheck="false"
          @keydown.enter="submit"
          @keydown.esc="resolveDialog(null)"
        />
        <div class="dlg-actions">
          <button class="btn ghost" @click="resolveDialog(null)">{{ t('dialog.cancel') }}</button>
          <button
            class="btn"
            :class="state.dialog.danger ? 'danger-fill' : 'primary'"
            @click="state.dialog.type === 'text' ? submit() : resolveDialog(true)"
          >
            {{ state.dialog.type === 'text' ? state.dialog.ok : state.dialog.ok }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.dlg { width: 360px; padding: 22px; gap: 0; }
.dlg-head { display: flex; align-items: center; gap: 10px; }
.dlg-head h3 { font-size: var(--fs-md); font-weight: 600; }
.dlg-warn { color: var(--danger); display: flex; }
.dlg-msg { margin-top: 8px; font-size: var(--fs-base); color: var(--fg-secondary); line-height: 1.5; }
.dlg-input {
  width: 100%;
  margin-top: 14px;
  padding: 10px 12px;
  border: 1.5px solid var(--border);
  border-radius: var(--r-md);
  background: var(--bg-input);
  color: var(--fg-text);
  font-size: var(--fs-base);
  font-family: inherit;
  outline: none;
  transition: border var(--t-fast), box-shadow var(--t-fast);
}
.dlg-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.dlg-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
.btn.danger-fill { background: var(--danger); color: #fff; }
.btn.danger-fill:hover { filter: brightness(1.06); }
</style>
