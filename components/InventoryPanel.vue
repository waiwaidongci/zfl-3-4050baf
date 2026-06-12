<template>
  <div class="inventory-panel">
    <section v-if="!selectedId" class="layout">
      <form class="panel" @submit.prevent="handleCreate">
        <h2>新建盘点单</h2>
        <label class="muted">盘点单名称</label>
        <input v-model="createForm.name" placeholder="例如：五一出行前盘点" />
        <label class="muted">盘点类型</label>
        <select v-model="createForm.type">
          <option value="出行前">出行前</option>
          <option value="出行后">出行后</option>
        </select>
        <label class="muted">关联出行（可选）</label>
        <select v-model="createForm.tripId">
          <option value="">不关联出行</option>
          <option v-for="trip in trips" :key="trip.id" :value="trip.id">
            {{ trip.destination }} · {{ trip.startDate }}
          </option>
        </select>
        <small class="muted">关联出行后将自动带入该出行清单的装备</small>
        <label class="muted">盘点人</label>
        <select v-model="createForm.checker">
          <option v-for="member in members" :key="member.id" :value="member.nickname">
            {{ member.nickname }}
          </option>
        </select>
        <label class="muted">备注</label>
        <textarea v-model="createForm.notes" placeholder="盘点说明或注意事项" rows="3"></textarea>
        <button type="submit">创建盘点单</button>
      </form>

      <div class="panel wide">
        <InventoryList :lists="inventoryLists" @select="selectInventory" />
      </div>
    </section>

    <section v-else class="panel">
      <InventoryDetail
        v-if="currentInventory"
        :inventory="currentInventory"
        :gears="gears"
        :trips="trips"
        :members="members"
        @back="goBack"
        @toggle-item="handleToggleItem"
        @update-item="handleUpdateItem"
        @remove-item="handleRemoveItem"
        @add-gear="handleAddGear"
        @add-gears-from-trip="handleAddGearsFromTrip"
        @complete="handleComplete"
        @reopen="handleReopen"
        @update-notes="handleUpdateNotes"
      />
      <div v-else class="empty-state">
        <p>盘点单不存在</p>
        <button class="ghost" @click="goBack">返回列表</button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, watch, toRef } from 'vue';
import InventoryList from './InventoryList.vue';
import InventoryDetail from './InventoryDetail.vue';
import { useInventory } from '../composables/useInventory.js';

const props = defineProps({
  inventoryLists: {
    type: Array,
    default: () => []
  },
  gears: {
    type: Array,
    default: () => []
  },
  trips: {
    type: Array,
    default: () => []
  },
  members: {
    type: Array,
    default: () => []
  },
  currentUser: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['update:inventoryLists']);

const selectedId = ref(null);

const createForm = ref({
  name: '',
  type: '出行前',
  tripId: '',
  checker: '',
  notes: ''
});

const inventory = useInventory({
  inventoryLists: toRef(props, 'inventoryLists'),
  gears: toRef(props, 'gears'),
  trips: toRef(props, 'trips'),
  members: toRef(props, 'members'),
  currentUser: toRef(props, 'currentUser')
});

const currentInventory = computed(() =>
  inventory.getListById(selectedId.value)
);

watch(
  () => props.currentUser,
  (val) => {
    if (val && !createForm.value.checker) {
      createForm.value.checker = val;
    }
  },
  { immediate: true }
);

watch(
  () => props.members,
  (val) => {
    if (val && val.length > 0 && !createForm.value.checker) {
      const firstMember = val.find((m) => m.nickname === props.currentUser);
      createForm.value.checker = firstMember ? firstMember.nickname : val[0].nickname;
    }
  },
  { immediate: true }
);

function selectInventory(id) {
  selectedId.value = id;
}

function goBack() {
  selectedId.value = null;
}

function updateLists(newLists) {
  emit('update:inventoryLists', newLists);
}

function handleCreate() {
  if (!createForm.value.name.trim()) {
    alert('请输入盘点单名称');
    return;
  }
  const newList = inventory.createList({
    name: createForm.value.name.trim(),
    type: createForm.value.type,
    tripId: createForm.value.tripId,
    checker: createForm.value.checker,
    notes: createForm.value.notes
  });
  if (newList) {
    updateLists([newList, ...props.inventoryLists]);
    selectedId.value = newList.id;
    createForm.value = {
      name: '',
      type: '出行前',
      tripId: '',
      checker: props.currentUser || '',
      notes: ''
    };
  }
}

function handleToggleItem(itemId) {
  const updated = inventory.toggleItemStatus(selectedId.value, itemId);
  if (updated) {
    updateLists(props.inventoryLists.map((l) => (l.id === selectedId.value ? updated : l)));
  }
}

function handleUpdateItem(itemId, updates) {
  const updated = inventory.updateItem(selectedId.value, itemId, updates);
  if (updated) {
    updateLists(props.inventoryLists.map((l) => (l.id === selectedId.value ? updated : l)));
  }
}

function handleRemoveItem(itemId) {
  const updated = inventory.removeItemFromList(selectedId.value, itemId);
  if (updated) {
    updateLists(props.inventoryLists.map((l) => (l.id === selectedId.value ? updated : l)));
  }
}

function handleAddGear(gearId) {
  const updated = inventory.addGearToList(selectedId.value, gearId);
  if (updated) {
    updateLists(props.inventoryLists.map((l) => (l.id === selectedId.value ? updated : l)));
  } else {
    alert('该装备已在盘点单中');
  }
}

function handleAddGearsFromTrip(tripId) {
  const updated = inventory.addGearsFromTrip(selectedId.value, tripId);
  if (updated) {
    const addedCount = updated.items.length - (currentInventory.value?.items?.length || 0);
    updateLists(props.inventoryLists.map((l) => (l.id === selectedId.value ? updated : l)));
    if (addedCount > 0) {
      alert(`已从出行清单添加 ${addedCount} 件装备`);
    } else {
      alert('没有新装备可添加（已全部存在）');
    }
  }
}

function handleComplete() {
  const updated = inventory.completeList(selectedId.value);
  if (updated) {
    updateLists(props.inventoryLists.map((l) => (l.id === selectedId.value ? updated : l)));
  }
}

function handleReopen() {
  const updated = inventory.reopenList(selectedId.value);
  if (updated) {
    updateLists(props.inventoryLists.map((l) => (l.id === selectedId.value ? updated : l)));
  }
}

function handleUpdateNotes(notes) {
  const updated = inventory.updateListInfo(selectedId.value, { notes });
  if (updated) {
    updateLists(props.inventoryLists.map((l) => (l.id === selectedId.value ? updated : l)));
  }
}
</script>

<style scoped>
.inventory-panel {
  width: 100%;
}

.layout {
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
  margin: 0 0 12px 0;
  color: #2f4a2c;
  font-size: 18px;
}

.panel label {
  display: block;
  font-size: 13px;
  color: #555;
  margin-bottom: 4px;
}

.panel input,
.panel select,
.panel textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d0d8c5;
  border-radius: 6px;
  font-size: 14px;
  margin-bottom: 12px;
  box-sizing: border-box;
  font-family: inherit;
}

.panel textarea {
  resize: vertical;
}

.panel button[type='submit'] {
  width: 100%;
  padding: 10px 16px;
  background: #2f4a2c;
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.2s;
}

.panel button[type='submit']:hover {
  background: #3d5c37;
}

.muted {
  color: #888;
  font-size: 12px;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: #999;
}

@media (max-width: 768px) {
  .layout {
    flex-direction: column;
  }

  .panel,
  .panel.wide {
    min-width: 100%;
  }
}
</style>
