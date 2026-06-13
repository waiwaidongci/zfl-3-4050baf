<template>
  <section class="data-import-export">
    <div class="panel">
      <h2>📤 数据导出</h2>
      <p class="description">将当前空间的所有数据导出为 JSON 文件，可用于备份或迁移到其他空间。</p>

      <div class="export-options">
        <label class="section-label">选择要导出的数据：</label>
        <div class="entity-checkboxes">
          <label v-for="entity in exportEntities" :key="entity.key" class="entity-checkbox">
            <input type="checkbox" v-model="selectedExportEntities" :value="entity.key" />
            <span>{{ entity.label }} ({{ getEntityCount(entity.key) }})</span>
          </label>
        </div>
      </div>

      <button class="btn-export" @click="handleExport" :disabled="selectedExportEntities.length === 0">
        导出选中数据
      </button>

      <button class="btn-export-all" @click="handleExportAll">
        导出全部数据
      </button>
    </div>

    <div class="panel wide">
      <h2>📥 数据导入</h2>
      <p class="description">选择 JSON 文件导入数据。导入前可预览数据摘要和异常项，确认后写入当前空间。</p>
      <p class="warning-note">⚠️ 导入将覆盖当前空间的对应数据，请谨慎操作。</p>

      <div v-if="!previewResult" class="import-upload">
        <div class="upload-area" @click="triggerFileInput" @dragover.prevent="isDragging = true" @dragleave="isDragging = false" @drop.prevent="handleDrop" :class="{ dragging: isDragging }">
          <div class="upload-icon">📁</div>
          <p>点击选择或拖拽 JSON 文件到此处</p>
          <small>支持本应用导出的 JSON 文件及旧版数据格式</small>
        </div>
        <input ref="fileInput" type="file" accept=".json,application/json" @change="handleFileSelect" hidden />
      </div>

      <div v-else class="import-preview-wrapper">
        <ImportPreview
          :previewResult="previewResult"
          :defaultMode="defaultImportMode"
          @cancel="cancelImport"
          @confirm="confirmImport"
        />
      </div>

      <div v-if="importSuccess" class="import-success">
        <div v-if="importStats" class="import-stats">
          <strong>✅ 合并导入成功！</strong>
          <div class="stats-row">
            <span>新增: {{ importStats.totalAdded }}</span>
            <span>更新: {{ importStats.totalUpdated }}</span>
            <span>跳过: {{ importStats.totalSkipped }}</span>
            <span v-if="importStats.totalUnmatched > 0">无法匹配: {{ importStats.totalUnmatched }}</span>
          </div>
        </div>
        <div v-else>
          ✅ 数据导入成功！当前空间数据已更新。
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed } from 'vue';
import ImportPreview from './ImportPreview.vue';
import { buildExportData, downloadJSON, readFileAsText, safeParseJSON } from '../composables/useSpaceStorage.js';
import { validateAndNormalizeForMerge, DATA_ENTITIES, ENTITY_LABELS } from '../utils/dataTransform.js';

const props = defineProps({
  spaceData: {
    type: Object,
    required: true
  },
  spaceInfo: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['imported', 'log-event']);

const fileInput = ref(null);
const isDragging = ref(false);
const previewResult = ref(null);
const importSuccess = ref(false);
const importStats = ref(null);
const defaultImportMode = ref('overwrite');
const selectedExportEntities = ref([...DATA_ENTITIES]);

const exportEntities = computed(() => {
  return DATA_ENTITIES.map((key) => ({
    key,
    label: ENTITY_LABELS[key]
  }));
});

function getEntityCount(entityKey) {
  const data = props.spaceData[entityKey];
  return Array.isArray(data) ? data.length : 0;
}

function buildSelectedExportData() {
  const result = {};
  selectedExportEntities.value.forEach((key) => {
    result[key] = props.spaceData[key] || [];
  });
  return result;
}

function handleExport() {
  const data = buildExportData(buildSelectedExportData(), props.spaceInfo);
  const spaceName = props.spaceInfo?.name || 'space';
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `露营装备数据-${spaceName}-${dateStr}.json`;
  
  const exportSummary = selectedExportEntities.value
    .map((key) => `${ENTITY_LABELS[key]}(${getEntityCount(key)})`)
    .join(', ');
  
  emit('log-event', {
    entityType: 'space',
    entityId: props.spaceInfo?.id || '',
    entityName: props.spaceInfo?.name || '空间',
    action: 'export',
    beforeState: null,
    afterState: {
      exportedEntities: [...selectedExportEntities.value],
      summary: exportSummary
    },
    sourcePage: '数据导入导出',
    notes: `导出数据：${exportSummary}`
  });
  
  downloadJSON(data, filename);
}

function handleExportAll() {
  selectedExportEntities.value = [...DATA_ENTITIES];
  setTimeout(() => {
    handleExport();
  }, 0);
}

function triggerFileInput() {
  fileInput.value?.click();
}

function handleFileSelect(event) {
  const file = event.target.files?.[0];
  if (file) {
    processFile(file);
  }
}

function handleDrop(event) {
  isDragging.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (file) {
    processFile(file);
  }
}

async function processFile(file) {
  importSuccess.value = false;
  importStats.value = null;
  try {
    const text = await readFileAsText(file);
    const rawData = safeParseJSON(text, null);
    if (rawData === null) {
      previewResult.value = {
        valid: false,
        errors: ['JSON 解析失败：文件内容不是有效的 JSON 格式'],
        warnings: [],
        data: null,
        summary: { totalWarnings: 0, hasLegacyFormat: false, isTemplateFormat: false, isClonedSpace: false }
      };
      return;
    }
    previewResult.value = validateAndNormalizeForMerge(rawData, props.spaceData);
  } catch (e) {
    previewResult.value = {
      valid: false,
      errors: [`读取文件失败：${e.message}`],
      warnings: [],
      data: null,
      summary: { totalWarnings: 0, hasLegacyFormat: false, isTemplateFormat: false, isClonedSpace: false }
    };
  }
}

function cancelImport() {
  previewResult.value = null;
  importSuccess.value = false;
  if (fileInput.value) {
    fileInput.value.value = '';
  }
}

function confirmImport({ data, mode, mergeAnalysis }) {
  const isMerge = mode === 'merge';
  const confirmMsg = isMerge
    ? '确定要合并导入数据吗？此操作将根据匹配规则新增、更新或跳过记录，不可撤销。'
    : '确定要覆盖导入数据吗？此操作将覆盖当前空间中对应的数据，不可撤销。';

  if (!confirm(confirmMsg)) {
    return;
  }

  emit('imported', { data, mode, mergeAnalysis });

  if (isMerge && mergeAnalysis) {
    importStats.value = mergeAnalysis.summary;
  } else {
    importStats.value = null;
  }

  importSuccess.value = true;
  previewResult.value = null;
  if (fileInput.value) {
    fileInput.value.value = '';
  }
  setTimeout(() => {
    importSuccess.value = false;
    importStats.value = null;
  }, 5000);
}
</script>

<style scoped>
.data-import-export {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}

.panel {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  flex: 1;
  min-width: 300px;
}

.panel.wide {
  flex: 2;
  min-width: 400px;
}

.panel h2 {
  margin: 0 0 8px 0;
  color: #2f4a2c;
  font-size: 18px;
}

.description {
  color: #666;
  font-size: 13px;
  margin: 0 0 16px 0;
  line-height: 1.6;
}

.warning-note {
  color: #c53030;
  font-size: 12px;
  margin: 0 0 16px 0;
  padding: 8px 12px;
  background: #fff5f5;
  border-radius: 6px;
}

.section-label {
  font-size: 13px;
  color: #555;
  font-weight: 500;
  margin-bottom: 8px;
  display: block;
}

.export-options {
  margin-bottom: 16px;
}

.entity-checkboxes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.entity-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #444;
  cursor: pointer;
  padding: 6px 8px;
  border-radius: 6px;
  background: #f7f9f5;
}

.entity-checkbox:hover {
  background: #eef2e9;
}

.entity-checkbox input {
  cursor: pointer;
}

.btn-export,
.btn-export-all {
  width: 100%;
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.2s;
}

.btn-export {
  background: #2f4a2c;
  color: #fff;
  margin-bottom: 10px;
}

.btn-export:hover:not(:disabled) {
  background: #3d5c37;
}

.btn-export:disabled {
  background: #999;
  cursor: not-allowed;
}

.btn-export-all {
  background: #fff;
  color: #2f4a2c;
  border: 1px solid #2f4a2c;
}

.btn-export-all:hover {
  background: #f0f4ed;
}

.import-upload {
  margin-top: 8px;
}

.upload-area {
  border: 2px dashed #c5d0b9;
  border-radius: 10px;
  padding: 40px 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  background: #fafcf7;
}

.upload-area:hover,
.upload-area.dragging {
  border-color: #2f4a2c;
  background: #f0f4ed;
}

.upload-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.upload-area p {
  margin: 0 0 6px 0;
  color: #333;
  font-size: 14px;
  font-weight: 500;
}

.upload-area small {
  color: #888;
  font-size: 12px;
}

.import-preview-wrapper {
  margin-top: 8px;
}

.import-success {
  margin-top: 16px;
  padding: 12px 16px;
  background: #d4edda;
  color: #155724;
  border-radius: 8px;
  font-size: 14px;
  text-align: center;
  animation: fadeIn 0.3s ease;
}

.import-stats {
  text-align: left;
}

.import-stats strong {
  display: block;
  margin-bottom: 8px;
  text-align: center;
  font-size: 15px;
}

.stats-row {
  display: flex;
  justify-content: center;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 13px;
}

.stats-row span {
  background: rgba(255, 255, 255, 0.5);
  padding: 4px 10px;
  border-radius: 4px;
  font-weight: 500;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 768px) {
  .data-import-export {
    flex-direction: column;
  }

  .entity-checkboxes {
    grid-template-columns: 1fr;
  }
}
</style>
