<script setup>
import { computed, onMounted, ref, watch } from 'vue';

const today = new Date();
const iso = (offset = 0) => {
  const date = new Date(today);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

const defaultMembers = [
  { id: crypto.randomUUID(), nickname: '阿岚', phone: '', area: '', notes: '' },
  { id: crypto.randomUUID(), nickname: '梁序', phone: '', area: '', notes: '' },
  { id: crypto.randomUUID(), nickname: '小北', phone: '', area: '', notes: '' },
  { id: crypto.randomUUID(), nickname: '陈默', phone: '', area: '', notes: '' }
];

const members = ref(defaultMembers);
const currentUser = ref('阿岚');
const tab = ref('装备库');
const category = ref('全部分类');
const requestFilter = ref('全部申请');
const form = ref({ name: '', category: '帐篷天幕', owner: '阿岚', available: iso(2), deposit: '100', status: '可借', notes: '' });
const requestForm = ref({ gearId: '', borrower: '梁序', start: iso(2), end: iso(4), reason: '' });

const memberForm = ref({ nickname: '', phone: '', area: '', notes: '' });
const editingMemberId = ref(null);
const deleteWarning = ref('');

const maintenanceTypes = ['清洁', '维修', '补件', '检查'];
const maintenanceForm = ref({ gearId: '', date: iso(0), type: '清洁', description: '', handler: '' });
const maintenanceFilter = ref('全部装备');

const tripForm = ref({ destination: '', startDate: iso(7), members: [], notes: '' });
const editingTripId = ref(null);
const selectedTripId = ref(null);
const tripGears = ref([]);
const tripCategoryFilter = ref('全部分类');

const gears = ref([
  { id: crypto.randomUUID(), name: '双人轻量帐', category: '帐篷天幕', owner: '阿岚', available: iso(1), deposit: '200', status: '可借', notes: '含地钉和防潮垫', damage: '' },
  { id: crypto.randomUUID(), name: '炉头套装', category: '炊具', owner: '梁序', available: iso(0), deposit: '80', status: '借出中', notes: '需自备气罐', damage: '' },
  { id: crypto.randomUUID(), name: '营地灯三件组', category: '照明', owner: '小北', available: iso(3), deposit: '50', status: '可借', notes: '满电交接', damage: '' }
]);

const requests = ref([
  { id: crypto.randomUUID(), gearId: gears.value[1].id, gearName: '炉头套装', owner: '梁序', borrower: '阿岚', start: iso(-1), end: iso(2), status: '已同意', reason: '周末湖边露营', damage: '' },
  { id: crypto.randomUUID(), gearId: gears.value[2].id, gearName: '营地灯三件组', owner: '小北', borrower: '陈默', start: iso(3), end: iso(5), status: '待处理', reason: '夜钓备用', damage: '' }
]);

function findGearForMaintenance(record, gearList = gears.value) {
  return gearList.find((gear) => gear.id === record.gearId)
    || gearList.find((gear) => gear.name === record.gearName && gear.owner === record.owner);
}

function normalizeMaintenanceRecords(records, gearList = gears.value) {
  return records
    .map((record) => {
      const gear = findGearForMaintenance(record, gearList);
      return gear ? { ...record, gearId: gear.id, gearName: gear.name, owner: gear.owner } : null;
    })
    .filter(Boolean);
}

function createDefaultMaintenanceRecords(gearList = gears.value) {
  const findGear = (name, owner) => gearList.find((gear) => gear.name === name && gear.owner === owner);
  const tent = findGear('双人轻量帐', '阿岚');
  const stove = findGear('炉头套装', '梁序');
  return [
    tent && { id: crypto.randomUUID(), gearId: tent.id, gearName: tent.name, owner: tent.owner, date: iso(-7), type: '清洁', description: '内外帐全面擦拭，通风晾干', handler: '阿岚' },
    tent && { id: crypto.randomUUID(), gearId: tent.id, gearName: tent.name, owner: tent.owner, date: iso(-20), type: '检查', description: '检查地钉和防风绳，状态良好', handler: '阿岚' },
    stove && { id: crypto.randomUUID(), gearId: stove.id, gearName: stove.name, owner: stove.owner, date: iso(-3), type: '补件', description: '更换了新的密封圈和点火电极', handler: '梁序' }
  ].filter(Boolean);
}

const maintenanceRecords = ref(createDefaultMaintenanceRecords());

function createDefaultTrips(gearList = gears.value, memberList = members.value) {
  const memberNames = memberList.map((m) => m.nickname);
  const availableGears = gearList.filter((g) => g.status === '可借');
  if (availableGears.length === 0) return [];
  const sampleGears = availableGears.slice(0, 2).map((g) => ({
    gearId: g.id,
    gearName: g.name,
    owner: g.owner,
    deposit: g.deposit,
    status: '待借'
  }));
  return [
    {
      id: crypto.randomUUID(),
      destination: '天目湖营地',
      startDate: iso(14),
      members: memberNames.slice(0, 3),
      gears: sampleGears,
      notes: '周末湖边露营，记得带驱蚊液'
    }
  ];
}

const trips = ref(createDefaultTrips());

function normalizeTrips(storedTrips, gearList = gears.value, memberList = members.value) {
  const memberNames = memberList.map((m) => m.nickname);
  return storedTrips.map((trip) => ({
    ...trip,
    members: trip.members.filter((m) => memberNames.includes(m)),
    gears: trip.gears
      .map((g) => {
        const gear = gearList.find((gear) => gear.id === g.gearId);
        if (!gear) return null;
        return {
          ...g,
          gearName: gear.name,
          owner: gear.owner,
          deposit: gear.deposit
        };
      })
      .filter(Boolean)
  }));
}

onMounted(() => {
  const storedMembers = localStorage.getItem('zfl-3-members');
  const storedGears = localStorage.getItem('zfl-3-gears');
  const storedRequests = localStorage.getItem('zfl-3-requests');
  const storedMaintenance = localStorage.getItem('zfl-3-maintenance');
  const storedTrips = localStorage.getItem('zfl-3-trips');
  if (storedMembers) members.value = JSON.parse(storedMembers);
  if (storedGears) gears.value = JSON.parse(storedGears);
  if (storedRequests) requests.value = JSON.parse(storedRequests);
  maintenanceRecords.value = storedMaintenance
    ? normalizeMaintenanceRecords(JSON.parse(storedMaintenance), gears.value)
    : createDefaultMaintenanceRecords(gears.value);
  trips.value = storedTrips
    ? normalizeTrips(JSON.parse(storedTrips), gears.value, members.value)
    : createDefaultTrips(gears.value, members.value);
  if (trips.value.length > 0 && !selectedTripId.value) {
    selectedTripId.value = trips.value[0].id;
  }
});

watch(members, (value) => localStorage.setItem('zfl-3-members', JSON.stringify(value)), { deep: true });
watch(gears, (value) => localStorage.setItem('zfl-3-gears', JSON.stringify(value)), { deep: true });
watch(requests, (value) => localStorage.setItem('zfl-3-requests', JSON.stringify(value)), { deep: true });
watch(maintenanceRecords, (value) => localStorage.setItem('zfl-3-maintenance', JSON.stringify(value)), { deep: true });
watch(trips, (value) => localStorage.setItem('zfl-3-trips', JSON.stringify(value)), { deep: true });

const categories = computed(() => ['全部分类', ...new Set(gears.value.map((gear) => gear.category))]);
const filteredGears = computed(() => gears.value.filter((gear) => category.value === '全部分类' || gear.category === category.value));
const requestList = computed(() => requests.value.filter((item) => requestFilter.value === '全部申请' || item.status === requestFilter.value));
const myOut = computed(() => requests.value.filter((item) => item.owner === currentUser.value));
const myIn = computed(() => requests.value.filter((item) => item.borrower === currentUser.value));

const myGears = computed(() => gears.value.filter((gear) => gear.owner === currentUser.value));
const validMaintenanceRecords = computed(() =>
  maintenanceRecords.value.filter((r) => gears.value.some((g) => g.id === r.gearId))
);
const maintenanceGearOptions = computed(() => ['全部装备', ...new Set(validMaintenanceRecords.value.map((r) => r.gearName))]);
const filteredMaintenance = computed(() => {
  return maintenanceFilter.value === '全部装备'
    ? validMaintenanceRecords.value
    : validMaintenanceRecords.value.filter((r) => r.gearName === maintenanceFilter.value);
});
const lastMaintenanceByGear = computed(() => {
  const map = {};
  for (const record of validMaintenanceRecords.value) {
    if (!map[record.gearId] || record.date > map[record.gearId].date) {
      map[record.gearId] = record;
    }
  }
  return map;
});
const maintenanceCount = computed(() => validMaintenanceRecords.value.length);

const selectedTrip = computed(() => trips.value.find((t) => t.id === selectedTripId.value));
const pendingGears = computed(() => selectedTrip.value ? selectedTrip.value.gears.filter((g) => g.status === '待借') : []);
const confirmedGears = computed(() => selectedTrip.value ? selectedTrip.value.gears.filter((g) => g.status === '已确认') : []);
const tripCategories = computed(() => ['全部分类', ...new Set(gears.value.map((gear) => gear.category))]);
const tripFilteredGears = computed(() => gears.value.filter((gear) => tripCategoryFilter.value === '全部分类' || gear.category === tripCategoryFilter.value));
const upcomingTrips = computed(() => trips.value.filter((t) => new Date(t.startDate) >= new Date(iso(0))));
const tripsCount = computed(() => trips.value.length);

function isGearAvailable(gearId) {
  const gear = gears.value.find((g) => g.id === gearId);
  return gear ? gear.status === '可借' : false;
}

function getGearStatus(gearId) {
  const gear = gears.value.find((g) => g.id === gearId);
  return gear ? gear.status : '未知';
}

function toggleTripGearSelection(gearId) {
  const idx = tripGears.value.findIndex((g) => g.gearId === gearId);
  if (idx > -1) {
    tripGears.value.splice(idx, 1);
  } else {
    const gear = gears.value.find((g) => g.id === gearId);
    if (gear) {
      tripGears.value.push({
        gearId: gear.id,
        gearName: gear.name,
        owner: gear.owner,
        deposit: gear.deposit,
        status: '待借'
      });
    }
  }
}

function isGearSelected(gearId) {
  return tripGears.value.some((g) => g.gearId === gearId);
}

function saveTrip() {
  if (!tripForm.value.destination.trim()) return;
  if (tripForm.value.members.length === 0) {
    alert('请至少选择一位参与成员');
    return;
  }
  if (editingTripId.value) {
    trips.value = trips.value.map((t) =>
      t.id === editingTripId.value
        ? {
            ...t,
            destination: tripForm.value.destination.trim(),
            startDate: tripForm.value.startDate,
            members: [...tripForm.value.members],
            gears: [...tripGears.value],
            notes: tripForm.value.notes
          }
        : t
    );
    if (selectedTripId.value === editingTripId.value) {
      selectedTripId.value = editingTripId.value;
    }
    editingTripId.value = null;
  } else {
    const newTrip = {
      id: crypto.randomUUID(),
      destination: tripForm.value.destination.trim(),
      startDate: tripForm.value.startDate,
      members: [...tripForm.value.members],
      gears: [...tripGears.value],
      notes: tripForm.value.notes
    };
    trips.value = [newTrip, ...trips.value];
    selectedTripId.value = newTrip.id;
  }
  resetTripForm();
}

function resetTripForm() {
  tripForm.value = { destination: '', startDate: iso(7), members: [], notes: '' };
  tripGears.value = [];
  editingTripId.value = null;
}

function editTrip(trip) {
  editingTripId.value = trip.id;
  tripForm.value = {
    destination: trip.destination,
    startDate: trip.startDate,
    members: [...trip.members],
    notes: trip.notes || ''
  };
  tripGears.value = trip.gears.map((g) => ({ ...g }));
}

function cancelEditTrip() {
  resetTripForm();
}

function deleteTrip(trip) {
  if (!confirm(`确定删除出行计划「${trip.destination}」吗？`)) return;
  trips.value = trips.value.filter((t) => t.id !== trip.id);
  if (selectedTripId.value === trip.id) {
    selectedTripId.value = trips.value.length > 0 ? trips.value[0].id : null;
  }
}

function selectTrip(tripId) {
  selectedTripId.value = tripId;
}

function updateTripGearStatus(gearId, status) {
  if (!selectedTrip.value) return;
  trips.value = trips.value.map((t) =>
    t.id === selectedTrip.value.id
      ? {
          ...t,
          gears: t.gears.map((g) => (g.gearId === gearId ? { ...g, status } : g))
        }
      : t
  );
}

function removeTripGear(gearId) {
  if (!selectedTrip.value) return;
  if (!confirm('确定从清单中移除该装备吗？')) return;
  trips.value = trips.value.map((t) =>
    t.id === selectedTrip.value.id
      ? {
          ...t,
          gears: t.gears.filter((g) => g.gearId !== gearId)
        }
      : t
  );
}

function addGear() {
  if (!form.value.name.trim()) return;
  gears.value = [{ id: crypto.randomUUID(), ...form.value, damage: '' }, ...gears.value];
  form.value = { name: '', category: '帐篷天幕', owner: currentUser.value, available: iso(2), deposit: '100', status: '可借', notes: '' };
}

function applyGear() {
  const gear = gears.value.find((item) => item.id === requestForm.value.gearId);
  if (!gear || !requestForm.value.borrower) return;
  requests.value = [{ id: crypto.randomUUID(), gearId: gear.id, gearName: gear.name, owner: gear.owner, status: '待处理', damage: '', ...requestForm.value }, ...requests.value];
  requestForm.value = { gearId: '', borrower: currentUser.value, start: iso(2), end: iso(4), reason: '' };
}

function updateRequest(id, status) {
  const record = requests.value.find((item) => item.id === id);
  requests.value = requests.value.map((item) => item.id === id ? { ...item, status } : item);
  if (record && status === '已同意') {
    gears.value = gears.value.map((gear) => gear.id === record.gearId ? { ...gear, status: '借出中' } : gear);
  }
}

function returnGear(record) {
  const damage = prompt('记录损耗情况，没有则填写无', '无');
  requests.value = requests.value.map((item) => item.id === record.id ? { ...item, status: '已归还', damage: damage || '无' } : item);
  gears.value = gears.value.map((gear) => gear.id === record.gearId ? { ...gear, status: '可借', damage: damage || '无' } : gear);
}

function saveMember() {
  if (!memberForm.value.nickname.trim()) return;
  if (editingMemberId.value) {
    const oldMember = members.value.find((m) => m.id === editingMemberId.value);
    const oldNickname = oldMember ? oldMember.nickname : '';
    const newNickname = memberForm.value.nickname.trim();
    members.value = members.value.map((m) =>
      m.id === editingMemberId.value
        ? { ...m, nickname: newNickname, phone: memberForm.value.phone, area: memberForm.value.area, notes: memberForm.value.notes }
        : m
    );
    if (oldNickname !== newNickname) {
      gears.value = gears.value.map((g) => g.owner === oldNickname ? { ...g, owner: newNickname } : g);
      requests.value = requests.value.map((r) => ({
        ...r,
        owner: r.owner === oldNickname ? newNickname : r.owner,
        borrower: r.borrower === oldNickname ? newNickname : r.borrower
      }));
      maintenanceRecords.value = maintenanceRecords.value.map((r) => ({
        ...r,
        owner: r.owner === oldNickname ? newNickname : r.owner,
        handler: r.handler === oldNickname ? newNickname : r.handler
      }));
      trips.value = trips.value.map((t) => ({
        ...t,
        members: t.members.map((m) => m === oldNickname ? newNickname : m),
        gears: t.gears.map((g) => g.owner === oldNickname ? { ...g, owner: newNickname } : g)
      }));
      if (currentUser.value === oldNickname) currentUser.value = newNickname;
      if (form.value.owner === oldNickname) form.value.owner = newNickname;
      if (requestForm.value.borrower === oldNickname) requestForm.value.borrower = newNickname;
    }
    editingMemberId.value = null;
  } else {
    members.value = [{ id: crypto.randomUUID(), nickname: memberForm.value.nickname.trim(), phone: memberForm.value.phone, area: memberForm.value.area, notes: memberForm.value.notes }, ...members.value];
  }
  memberForm.value = { nickname: '', phone: '', area: '', notes: '' };
}

function editMember(member) {
  editingMemberId.value = member.id;
  memberForm.value = { nickname: member.nickname, phone: member.phone, area: member.area, notes: member.notes };
}

function cancelEditMember() {
  editingMemberId.value = null;
  memberForm.value = { nickname: '', phone: '', area: '', notes: '' };
}

function deleteMember(member) {
  const nickname = member.nickname;
  const gearCount = gears.value.filter((g) => g.owner === nickname).length;
  const borrowCount = requests.value.filter((r) => r.borrower === nickname).length;
  const ownCount = requests.value.filter((r) => r.owner === nickname).length;
  const maintenanceOwnerCount = maintenanceRecords.value.filter((r) => r.owner === nickname).length;
  const maintenanceHandlerCount = maintenanceRecords.value.filter((r) => r.handler === nickname).length;
  const tripMemberCount = trips.value.filter((t) => t.members.includes(nickname)).length;
  const tripGearOwnerCount = trips.value.filter((t) => t.gears.some((g) => g.owner === nickname)).length;
  if (gearCount > 0 || borrowCount > 0 || ownCount > 0 || maintenanceOwnerCount > 0 || maintenanceHandlerCount > 0 || tripMemberCount > 0 || tripGearOwnerCount > 0) {
    const reasons = [];
    if (gearCount > 0) reasons.push(`${gearCount}件登记装备`);
    if (ownCount > 0) reasons.push(`${ownCount}条作为出借人的申请`);
    if (borrowCount > 0) reasons.push(`${borrowCount}条作为借用人的申请`);
    if (maintenanceOwnerCount > 0) reasons.push(`${maintenanceOwnerCount}条装备保养记录`);
    if (maintenanceHandlerCount > 0) reasons.push(`${maintenanceHandlerCount}条作为处理人的保养记录`);
    if (tripMemberCount > 0) reasons.push(`${tripMemberCount}个出行计划的参与成员`);
    if (tripGearOwnerCount > 0) reasons.push(`${tripGearOwnerCount}个出行计划的装备主人`);
    deleteWarning.value = `无法删除「${nickname}」：该成员关联了${reasons.join('、')}，请先处理关联数据。`;
    return;
  }
  members.value = members.value.filter((m) => m.id !== member.id);
  if (currentUser.value === nickname && members.value.length > 0) {
    currentUser.value = members.value[0].nickname;
  }
  deleteWarning.value = '';
}

function dismissWarning() {
  deleteWarning.value = '';
}

function addMaintenance() {
  const gear = gears.value.find((g) => g.id === maintenanceForm.value.gearId);
  if (!gear) return;
  if (gear.owner !== currentUser.value) {
    alert('仅装备主人可登记保养记录');
    return;
  }
  const handler = maintenanceForm.value.handler.trim() || currentUser.value;
  maintenanceRecords.value = [{
    id: crypto.randomUUID(),
    gearId: gear.id,
    gearName: gear.name,
    owner: gear.owner,
    date: maintenanceForm.value.date,
    type: maintenanceForm.value.type,
    description: maintenanceForm.value.description,
    handler
  }, ...maintenanceRecords.value];
  maintenanceForm.value = { gearId: '', date: iso(0), type: '清洁', description: '', handler: '' };
}

function deleteMaintenance(id) {
  if (!confirm('确定删除该保养记录？')) return;
  maintenanceRecords.value = maintenanceRecords.value.filter((r) => r.id !== id);
}
</script>

<template>
  <main>
    <header class="hero">
      <div>
        <p>露营装备共享社群</p>
        <h1>装备借用工作台</h1>
      </div>
      <label>
        当前成员
        <select v-model="currentUser">
          <option v-for="member in members" :key="member.id">{{ member.nickname }}</option>
        </select>
      </label>
    </header>

    <nav class="tabs">
      <button v-for="item in ['装备库','申请列表','保养记录','出行清单','成员资料','我的借出','我的借入']" :key="item" :class="{ active: tab === item }" @click="tab = item">{{ item }}</button>
    </nav>

    <section class="metrics">
      <article><strong>{{ gears.length }}</strong><span>登记装备</span></article>
      <article><strong>{{ gears.filter((item) => item.status === '可借').length }}</strong><span>当前可借</span></article>
      <article><strong>{{ requests.filter((item) => item.status === '待处理').length }}</strong><span>待处理申请</span></article>
      <article><strong>{{ maintenanceCount }}</strong><span>保养记录</span></article>
      <article><strong>{{ tripsCount }}</strong><span>出行计划</span></article>
      <article><strong>{{ members.length }}</strong><span>社群成员</span></article>
    </section>

    <section v-if="tab === '装备库'" class="layout">
      <form class="panel" @submit.prevent="addGear">
        <h2>登记装备</h2>
        <input v-model="form.name" placeholder="装备名称" />
        <select v-model="form.category">
          <option>帐篷天幕</option>
          <option>炊具</option>
          <option>照明</option>
          <option>桌椅收纳</option>
          <option>安全急救</option>
        </select>
        <select v-model="form.owner">
          <option v-for="member in members" :key="member.id">{{ member.nickname }}</option>
        </select>
        <div class="split">
          <input v-model="form.available" type="date" />
          <input v-model="form.deposit" placeholder="押金" />
        </div>
        <textarea v-model="form.notes" placeholder="使用注意事项"></textarea>
        <button>保存装备</button>
      </form>

      <div class="panel wide">
        <div class="toolbar">
          <h2>装备库</h2>
          <select v-model="category">
            <option v-for="item in categories" :key="item">{{ item }}</option>
          </select>
        </div>
        <div class="cards">
          <article v-for="gear in filteredGears" :key="gear.id">
            <strong>{{ gear.name }}</strong>
            <span>{{ gear.category }} · {{ gear.owner }}</span>
            <p>{{ gear.status }} · 可借日期{{ gear.available }} · 押金{{ gear.deposit }}</p>
            <small>{{ gear.notes }}</small>
            <div v-if="lastMaintenanceByGear[gear.id]" class="maintenance-badge" style="margin-top: 10px; padding: 8px 10px; background: #edf1e8; border-radius: 6px; font-size: 12px;">
              <span style="color: #2f4a2c; font-weight: 600;">最近保养：</span>
              <span>{{ lastMaintenanceByGear[gear.id].date }} · {{ lastMaintenanceByGear[gear.id].type }}</span>
              <div v-if="lastMaintenanceByGear[gear.id].description" style="margin-top: 4px; color: #63705d;">
                {{ lastMaintenanceByGear[gear.id].description }}
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section v-if="tab === '申请列表'" class="layout">
      <form class="panel" @submit.prevent="applyGear">
        <h2>发起借用</h2>
        <select v-model="requestForm.gearId">
          <option value="">选择装备</option>
          <option v-for="gear in gears.filter((item) => item.status === '可借')" :key="gear.id" :value="gear.id">{{ gear.name }}</option>
        </select>
        <select v-model="requestForm.borrower">
          <option v-for="member in members" :key="member.id">{{ member.nickname }}</option>
        </select>
        <div class="split">
          <input v-model="requestForm.start" type="date" />
          <input v-model="requestForm.end" type="date" />
        </div>
        <textarea v-model="requestForm.reason" placeholder="借用说明"></textarea>
        <button>提交申请</button>
      </form>
      <div class="panel wide">
        <div class="toolbar">
          <h2>申请流转</h2>
          <select v-model="requestFilter">
            <option>全部申请</option>
            <option>待处理</option>
            <option>已同意</option>
            <option>已拒绝</option>
            <option>已归还</option>
          </select>
        </div>
        <div class="requestList">
          <article v-for="item in requestList" :key="item.id">
            <div>
              <strong>{{ item.gearName }}</strong>
              <span>{{ item.borrower }}申请 · {{ item.start }}至{{ item.end }}</span>
            </div>
            <p>{{ item.status }} · 装备主人{{ item.owner }} · {{ item.reason }}</p>
            <div class="actions" v-if="item.status === '待处理'">
              <button @click="updateRequest(item.id, '已同意')">同意</button>
              <button class="ghost" @click="updateRequest(item.id, '已拒绝')">拒绝</button>
            </div>
            <button v-if="item.status === '已同意'" class="ghost" @click="returnGear(item)">登记归还</button>
          </article>
        </div>
      </div>
    </section>

    <section v-if="tab === '保养记录'" class="layout">
      <form class="panel" @submit.prevent="addMaintenance">
        <h2>登记保养</h2>
        <select v-model="maintenanceForm.gearId">
          <option value="">选择装备</option>
          <option v-for="gear in myGears" :key="gear.id" :value="gear.id">{{ gear.name }}</option>
        </select>
        <input v-model="maintenanceForm.date" type="date" />
        <select v-model="maintenanceForm.type">
          <option v-for="t in maintenanceTypes" :key="t">{{ t }}</option>
        </select>
        <input v-model="maintenanceForm.handler" placeholder="处理人（默认为当前成员）" />
        <textarea v-model="maintenanceForm.description" placeholder="保养说明（清洁部位、维修内容、补充零件、检查结果等）"></textarea>
        <button>保存记录</button>
        <small v-if="myGears.length === 0" class="muted">当前成员名下暂无装备，无法登记保养记录。</small>
      </form>

      <div class="panel wide">
        <div class="toolbar">
          <h2>保养记录</h2>
          <select v-model="maintenanceFilter">
            <option v-for="opt in maintenanceGearOptions" :key="opt">{{ opt }}</option>
          </select>
        </div>
        <div v-if="filteredMaintenance.length === 0" class="muted" style="padding: 20px; text-align: center;">暂无保养记录</div>
        <div v-else class="requestList">
          <article v-for="record in filteredMaintenance" :key="record.id">
            <div>
              <strong>{{ record.gearName }}</strong>
              <span>{{ record.date }} · {{ record.type }} · 处理人 {{ record.handler }}</span>
            </div>
            <p>装备主人：{{ record.owner }}</p>
            <p v-if="record.description" style="margin-top: 6px;">{{ record.description }}</p>
            <div class="actions" v-if="record.owner === currentUser">
              <button class="ghost small danger" @click="deleteMaintenance(record.id)">删除</button>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section v-if="tab === '成员资料'" class="layout">
      <form class="panel" @submit.prevent="saveMember">
        <h2>{{ editingMemberId ? '编辑成员' : '添加成员' }}</h2>
        <input v-model="memberForm.nickname" placeholder="昵称" />
        <input v-model="memberForm.phone" placeholder="联系电话" />
        <input v-model="memberForm.area" placeholder="常用露营区域" />
        <textarea v-model="memberForm.notes" placeholder="备注"></textarea>
        <div class="split">
          <button>{{ editingMemberId ? '保存修改' : '添加成员' }}</button>
          <button v-if="editingMemberId" type="button" class="ghost" @click="cancelEditMember">取消</button>
        </div>
      </form>

      <div class="panel wide">
        <div class="toolbar">
          <h2>成员列表</h2>
          <span class="muted">共 {{ members.length }} 人</span>
        </div>

        <div v-if="deleteWarning" class="warning">
          <span>{{ deleteWarning }}</span>
          <button class="ghost small" @click="dismissWarning">关闭</button>
        </div>

        <div class="memberList">
          <article v-for="member in members" :key="member.id" class="member-card">
            <div class="member-info">
              <strong>{{ member.nickname }}</strong>
              <span v-if="member.phone">📞 {{ member.phone }}</span>
              <span v-if="member.area">🏕 {{ member.area }}</span>
              <small v-if="member.notes">{{ member.notes }}</small>
            </div>
            <div class="actions">
              <button class="ghost small" @click="editMember(member)">编辑</button>
              <button class="ghost small danger" @click="deleteMember(member)">删除</button>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section v-if="tab === '出行清单'" class="layout">
      <form class="panel" @submit.prevent="saveTrip">
        <h2>{{ editingTripId ? '编辑出行计划' : '创建出行计划' }}</h2>
        <input v-model="tripForm.destination" placeholder="目的地" />
        <input v-model="tripForm.startDate" type="date" />
        <div class="member-checkboxes">
          <label class="muted">参与成员</label>
          <div class="checkbox-list">
            <label v-for="member in members" :key="member.id" class="checkbox-item">
              <input type="checkbox" :value="member.nickname" v-model="tripForm.members" />
              <span>{{ member.nickname }}</span>
            </label>
          </div>
        </div>
        <div class="gear-select-section">
          <label class="muted">勾选要带的装备</label>
          <select v-model="tripCategoryFilter" style="margin-bottom: 8px;">
            <option v-for="cat in tripCategories" :key="cat">{{ cat }}</option>
          </select>
          <div class="gear-checklist">
            <label v-for="gear in tripFilteredGears" :key="gear.id" class="gear-checkbox-item">
              <input type="checkbox" :checked="isGearSelected(gear.id)" @change="toggleTripGearSelection(gear.id)" />
              <div class="gear-info">
                <span class="gear-name">{{ gear.name }}</span>
                <span class="gear-meta">{{ gear.category }} · {{ gear.owner }}</span>
                <span :class="['gear-status', gear.status === '可借' ? 'available' : 'unavailable']">{{ gear.status }}</span>
              </div>
            </label>
          </div>
        </div>
        <textarea v-model="tripForm.notes" placeholder="备注信息"></textarea>
        <div class="split">
          <button>{{ editingTripId ? '保存修改' : '创建计划' }}</button>
          <button v-if="editingTripId" type="button" class="ghost" @click="cancelEditTrip">取消</button>
        </div>
        <small class="muted">已选 {{ tripGears.length }} 件装备</small>
      </form>

      <div class="panel wide">
        <div class="toolbar">
          <h2>出行计划列表</h2>
          <span class="muted">共 {{ trips.length }} 个计划</span>
        </div>

        <div v-if="trips.length === 0" class="muted" style="padding: 20px; text-align: center;">暂无出行计划，创建一个吧！</div>

        <div v-else class="trip-layout">
          <div class="trip-list">
            <article
              v-for="trip in trips"
              :key="trip.id"
              :class="['trip-card', { active: selectedTripId === trip.id }]"
              @click="selectTrip(trip.id)"
            >
              <div class="trip-header">
                <strong>{{ trip.destination }}</strong>
                <span class="trip-date">🗓 {{ trip.startDate }}</span>
              </div>
              <div class="trip-meta">
                <span>👥 {{ trip.members.join('、') }}</span>
                <span>🎒 {{ trip.gears.length }} 件装备</span>
              </div>
              <div class="trip-actions" @click.stop>
                <button class="ghost small" @click="editTrip(trip)">编辑</button>
                <button class="ghost small danger" @click="deleteTrip(trip)">删除</button>
              </div>
            </article>
          </div>

          <div v-if="selectedTrip" class="trip-detail">
            <div class="trip-detail-header">
              <h3>{{ selectedTrip?.destination }}</h3>
              <span class="muted">出发日期：{{ selectedTrip?.startDate }}</span>
              <span class="muted">参与成员：{{ selectedTrip?.members?.join('、') }}</span>
              <p v-if="selectedTrip?.notes" class="trip-notes">{{ selectedTrip?.notes }}</p>
            </div>

            <div class="trip-gear-sections">
              <div class="gear-section">
                <div class="section-header">
                  <h4>待借清单 ({{ pendingGears.length }})</h4>
                </div>
                <div v-if="pendingGears.length === 0" class="muted" style="padding: 12px; text-align: center;">暂无待借装备</div>
                <div v-else class="gear-list">
                  <article v-for="gear in pendingGears" :key="gear.gearId" class="gear-list-item">
                    <div class="gear-list-info">
                      <strong>{{ gear.gearName }}</strong>
                      <span>装备主人：{{ gear.owner }} · 押金：{{ gear.deposit }}</span>
                      <span :class="['availability-badge', isGearAvailable(gear.gearId) ? 'available' : 'unavailable']">
                        {{ isGearAvailable(gear.gearId) ? '✓ 当前可借' : '✗ ' + getGearStatus(gear.gearId) }}
                      </span>
                    </div>
                    <div class="gear-list-actions">
                      <button class="ghost small" @click="updateTripGearStatus(gear.gearId, '已确认')">确认已借</button>
                      <button class="ghost small danger" @click="removeTripGear(gear.gearId)">移除</button>
                    </div>
                  </article>
                </div>
              </div>

              <div class="gear-section">
                <div class="section-header">
                  <h4>已确认清单 ({{ confirmedGears.length }})</h4>
                </div>
                <div v-if="confirmedGears.length === 0" class="muted" style="padding: 12px; text-align: center;">暂无已确认装备</div>
                <div v-else class="gear-list">
                  <article v-for="gear in confirmedGears" :key="gear.gearId" class="gear-list-item confirmed">
                    <div class="gear-list-info">
                      <strong>{{ gear.gearName }}</strong>
                      <span>装备主人：{{ gear.owner }} · 押金：{{ gear.deposit }}</span>
                      <span :class="['availability-badge', isGearAvailable(gear.gearId) ? 'available' : 'unavailable']">
                        {{ isGearAvailable(gear.gearId) ? '✓ 当前可借' : '✗ ' + getGearStatus(gear.gearId) }}
                      </span>
                    </div>
                    <div class="gear-list-actions">
                      <button class="ghost small" @click="updateTripGearStatus(gear.gearId, '待借')">改为待借</button>
                      <button class="ghost small danger" @click="removeTripGear(gear.gearId)">移除</button>
                    </div>
                  </article>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="muted" style="padding: 40px; text-align: center;">选择左侧计划查看详情</div>
        </div>
      </div>
    </section>

    <section v-if="tab === '我的借出' || tab === '我的借入'" class="panel">
      <h2>{{ tab }}</h2>
      <div class="requestList">
        <article v-for="item in (tab === '我的借出' ? myOut : myIn)" :key="item.id">
          <strong>{{ item.gearName }}</strong>
          <span>{{ item.status }} · {{ item.borrower }} · {{ item.start }}至{{ item.end }}</span>
          <p>损耗记录：{{ item.damage || '暂无' }}</p>
        </article>
      </div>
    </section>
  </main>
</template>

<style>
* { box-sizing: border-box; }
body { margin: 0; background: #f2f4ed; color: #22251f; font-family: Inter, "PingFang SC", Arial, sans-serif; }
button, input, select, textarea { font: inherit; }
main { min-height: 100vh; padding: 28px; }
.hero { display: flex; justify-content: space-between; gap: 20px; align-items: end; padding: 30px; border-radius: 8px; color: #fff; background: linear-gradient(135deg, #263623, #84704f); }
.hero p { margin: 0 0 6px; opacity: .8; }
h1 { margin: 0; font-size: clamp(32px, 5vw, 56px); letter-spacing: 0; }
h2 { margin: 0; font-size: 18px; }
.hero label { display: grid; gap: 8px; min-width: 190px; }
.tabs { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
.tabs button { background: #fff; color: #303427; border: 1px solid #d8dccf; }
.tabs .active { background: #2f4a2c; color: #fff; }
.metrics { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 16px; }
.metrics article, .panel, .cards article, .requestList article { background: #fff; border: 1px solid #dfe3d5; border-radius: 8px; padding: 18px; box-shadow: 0 10px 28px rgb(33 42 27 / .07); }
.metrics strong { display: block; font-size: 28px; }
.metrics span, article span, p, small { color: #63705d; }
.layout { display: grid; grid-template-columns: 340px 1fr; gap: 16px; align-items: start; }
form.panel { display: flex; flex-direction: column; gap: 10px; }
input, select, textarea { width: 100%; border: 1px solid #cfd8ca; border-radius: 8px; padding: 11px 12px; background: #fff; color: #22251f; }
textarea { min-height: 96px; resize: vertical; }
button { border: 0; border-radius: 8px; padding: 11px 14px; background: #2f4a2c; color: #fff; cursor: pointer; }
.ghost { background: #edf1e8; color: #2c3527; }
.ghost.small { padding: 6px 12px; font-size: 13px; }
.ghost.danger { color: #9b2c2c; }
.split { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.toolbar { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 14px; }
.toolbar select { max-width: 220px; }
.muted { color: #63705d; font-size: 14px; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; }
article strong, article span { display: block; }
article span { margin-top: 5px; }
.requestList, .memberList { display: grid; gap: 10px; }
.warning { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 12px 16px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; gap: 12px; color: #92400e; font-size: 14px; }
.member-card { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.member-info { flex: 1; }
.member-info small { display: block; margin-top: 6px; }
.actions { display: flex; gap: 8px; margin-top: 10px; }

.member-checkboxes, .gear-select-section { display: flex; flex-direction: column; gap: 6px; }
.checkbox-list { display: flex; flex-direction: column; gap: 6px; max-height: 120px; overflow-y: auto; border: 1px solid #cfd8ca; border-radius: 8px; padding: 8px; }
.checkbox-item { display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 4px 6px; border-radius: 4px; }
.checkbox-item:hover { background: #edf1e8; }
.checkbox-item input { width: auto; margin: 0; }
.checkbox-item span { margin: 0; color: #22251f; }

.gear-checklist { display: flex; flex-direction: column; gap: 6px; max-height: 240px; overflow-y: auto; border: 1px solid #cfd8ca; border-radius: 8px; padding: 8px; }
.gear-checkbox-item { display: flex; align-items: flex-start; gap: 8px; cursor: pointer; padding: 8px; border-radius: 6px; }
.gear-checkbox-item:hover { background: #edf1e8; }
.gear-checkbox-item input { width: auto; margin-top: 4px; }
.gear-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.gear-name { font-weight: 600; color: #22251f; }
.gear-meta { font-size: 12px; color: #63705d; }
.gear-status { font-size: 12px; padding: 2px 8px; border-radius: 4px; width: fit-content; }
.gear-status.available { background: #dcfce7; color: #166534; }
.gear-status.unavailable { background: #fee2e2; color: #991b1b; }

.trip-layout { display: grid; grid-template-columns: 280px 1fr; gap: 16px; align-items: start; }
.trip-list { display: flex; flex-direction: column; gap: 10px; }
.trip-card { background: #fff; border: 1px solid #dfe3d5; border-radius: 8px; padding: 14px; cursor: pointer; transition: all 0.2s; }
.trip-card:hover { border-color: #2f4a2c; }
.trip-card.active { border-color: #2f4a2c; background: #f6f8f2; }
.trip-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.trip-header strong { font-size: 15px; }
.trip-date { font-size: 12px; color: #63705d; white-space: nowrap; }
.trip-meta { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
.trip-meta span { font-size: 12px; margin: 0; }
.trip-actions { display: flex; gap: 6px; }

.trip-detail { display: flex; flex-direction: column; gap: 16px; }
.trip-detail-header { background: #f6f8f2; border-radius: 8px; padding: 16px; }
.trip-detail-header h3 { margin: 0 0 8px; font-size: 20px; }
.trip-detail-header span { display: block; margin-top: 4px; }
.trip-notes { margin: 8px 0 0; padding: 10px; background: #fff; border-radius: 6px; border-left: 3px solid #2f4a2c; }

.trip-gear-sections { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.gear-section { display: flex; flex-direction: column; gap: 10px; }
.section-header h4 { margin: 0; font-size: 16px; color: #2f4a2c; }
.gear-list { display: flex; flex-direction: column; gap: 8px; }
.gear-list-item { background: #fff; border: 1px solid #dfe3d5; border-radius: 8px; padding: 12px; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.gear-list-item.confirmed { border-left: 4px solid #16a34a; background: #f0fdf4; }
.gear-list-info { flex: 1; }
.gear-list-info strong { display: block; margin-bottom: 4px; }
.gear-list-info span { display: block; margin-top: 4px; font-size: 13px; }
.availability-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin-top: 6px; }
.availability-badge.available { background: #dcfce7; color: #166534; }
.availability-badge.unavailable { background: #fee2e2; color: #991b1b; }
.gear-list-actions { display: flex; gap: 6px; flex-shrink: 0; }

@media (max-width: 900px) { main { padding: 16px; } .hero, .toolbar { flex-direction: column; align-items: start; } .metrics, .layout, .split, .trip-layout, .trip-gear-sections { grid-template-columns: 1fr; } .member-card { flex-direction: column; } }
</style>
