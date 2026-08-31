// Estado Base de la Aplicación
let inventory = [];
let repairs = [];
let sales = [];
let users = [];

let cart = [];
let activeCategory = 'All';
let currentUser = null;
let selectedEmpForDetail = null;
let html5QrCode = null;
let activeScanTarget = 'pos';

// 1. SINCRONIZACIÓN EN TIEMPO REAL CON LA NUBE
function initCloudSync() {
  db.collection("inventory").onSnapshot(snapshot => {
    inventory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if(inventory.length === 0) seedDefaultInventory();
    renderPosProducts();
    renderInventory();
    renderDashboard();
    updateCloudStatus();
  });

  db.collection("repairs").onSnapshot(snapshot => {
    repairs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderRepairs();
    renderDashboard();
  });

  db.collection("sales").onSnapshot(snapshot => {
    sales = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderHistory();
    renderDashboard();
  });

  db.collection("users").onSnapshot(snapshot => {
    users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if(users.length === 0) {
      seedDefaultUser();
    } else {
      renderUsers();
    }
  });
}

function updateCloudStatus() {
  const badge = document.getElementById('cloud-status');
  if (badge) {
    badge.className = "fixed top-2 right-2 z-50 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 backdrop-blur-md";
    badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400"></span><span>Nube Conectada</span>`;
  }
}

// 2. DATOS INICIALES (SEMILLAS)
function seedDefaultInventory() {
  const defaults = [
    { name: 'iPhone 13 128GB', category: 'Teléfonos', code: '8839201', price: 650.00, stock: 3 },
    { name: 'Funda Silicona iPhone', category: 'Accesorios', code: 'ACC001', price: 15.00, stock: 25 },
    { name: 'Vape Pod Kit', category: 'Vapeo', code: 'VAP102', price: 35.00, stock: 8 }
  ];
  defaults.forEach(item => db.collection("inventory").add(item));
}

function seedDefaultUser() {
  db.collection("users").add({
    name: 'Cecilyah Brito', 
    email: 'admin@lksmartphone.com', 
    phone: '(809) 555-0199',
    address: 'Calle Principal #12',
    emergency: 'Alex - (809) 555-0100',
    role: 'Administrador', 
    pin: '9888', 
    joined: '2026-05-10',
    attendance: [],
    idImage: null,
    dayRate: 50.00, bonus: 0, deduction: 0
  });
}

// 3. AUTENTICACIÓN Y PIN
async function submitPin() {
  const enteredPin = document.getElementById('pin-input').value.trim();
  if(!enteredPin) return alert('Por favor ingrese su PIN de acceso.');

  const loginBtn = document.querySelector("#login-modal button");
  if (loginBtn) {
    loginBtn.innerText = "Verificando...";
    loginBtn.disabled = true;
  }

  try {
    const snapshot = await db.collection("users").get({ source: "server" }).catch(() => db.collection("users").get());
    users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const foundUser = users.find(u => String(u.pin) === String(enteredPin));

    if(foundUser) {
      currentUser = foundUser;
      
      let updatedAttendance = foundUser.attendance || [];
      const todayStr = new Date().toISOString().split('T')[0];
      const lastEntry = updatedAttendance[updatedAttendance.length - 1];
      
      if (!lastEntry || !lastEntry.startsWith(todayStr)) {
        updatedAttendance.push(new Date().toLocaleString());
        await db.collection("users").doc(foundUser.id).update({ attendance: updatedAttendance });
      }

      const badgeStyle = foundUser.role === 'Administrador' ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/20 text-blue-300';
      setupUserInterface(foundUser.name, foundUser.role, badgeStyle);
    } else {
      alert('PIN Incorrecto. Verifique el PIN configurado en la nube.');
      document.getElementById('pin-input').value = '';
    }
  } catch (error) {
    alert('Error al conectar con la nube.');
  } finally {
    if (loginBtn) {
      loginBtn.innerText = "Marcar Entrada / Ingresar";
      loginBtn.disabled = false;
    }
  }
}

function setupUserInterface(name, roleName, badgeClass) {
  document.getElementById('login-modal').classList.add('hidden');
  document.getElementById('main-header').classList.remove('hidden');
  document.getElementById('main-content').classList.remove('hidden');

  document.getElementById('current-user-name').innerText = name;
  const badge = document.getElementById('user-role-badge');
  badge.innerText = roleName;
  badge.className = `px-2 py-0.5 rounded text-[10px] font-bold uppercase ${badgeClass}`;

  // RESTRICCIÓN DE ROLES
  if(roleName === 'Empleado') {
    // Ocultar pestañas y herramientas exclusivas de Administrador
    document.getElementById('nav-dashboard').classList.add('hidden');
    document.getElementById('nav-inventory').classList.add('hidden'); // Oculta Inventario
    document.getElementById('nav-shift-close').classList.add('hidden'); // Oculta Cierre de Caja
    document.getElementById('nav-users').classList.add('hidden'); // Oculta Personal RRHH
    document.getElementById('nav-history').classList.add('hidden');
    document.getElementById('btn-add-product').classList.add('hidden');
    
    // Redirigir al POS
    switchTab('pos');
  } else {
    // Mostrar todo para Administradores
    document.getElementById('nav-dashboard').classList.remove('hidden');
    document.getElementById('nav-inventory').classList.remove('hidden');
    document.getElementById('nav-shift-close').classList.remove('hidden');
    document.getElementById('nav-users').classList.remove('hidden');
    document.getElementById('nav-history').classList.remove('hidden');
    document.getElementById('btn-add-product').classList.remove('hidden');
    
    switchTab('dashboard');
  }
}
  }
}

function logout() {
  currentUser = null;
  document.getElementById('pin-input').value = '';
  document.getElementById('main-header').classList.add('hidden');
  document.getElementById('main-content').classList.add('hidden');
  document.getElementById('login-modal').classList.remove('hidden');
  stopCameraScanner();
}

// 4. PERSONAL Y RRHH (ASISTENCIA & NÓMINA PASADA)
function renderUsers() {
  const tbody = document.getElementById('users-table-body');
  if(!tbody) return;
  tbody.innerHTML = '';

  users.forEach(u => {
    const roleBadge = u.role === 'Administrador' 
      ? 'bg-purple-100 text-purple-800 border-purple-200' 
      : 'bg-blue-100 text-blue-800 border-blue-200';

    const daysWorked = u.attendance ? u.attendance.length : 0;

    tbody.innerHTML += `
      <tr class="hover:bg-slate-50">
        <td class="p-4 font-bold text-slate-800">
          <p class="text-xs font-bold text-slate-900">${u.name}</p>
          <p class="text-[10px] text-slate-400 font-normal">${u.email || ''}</p>
        </td>
        <td class="p-4 text-slate-600 text-[11px]">
          <p>📞 ${u.phone || 'Sin tel.'}</p>
          <p class="text-[10px] text-slate-400">🏠 ${u.address || 'Sin dirección'}</p>
        </td>
        <td class="p-4 text-slate-600 text-[11px] font-medium">
          🚨 ${u.emergency || 'No especificado'}
        </td>
        <td class="p-4">
          <span class="px-2 py-0.5 rounded-full border text-[9px] font-bold ${roleBadge}">${u.role}</span>
          <p class="text-[10px] font-mono font-bold text-slate-500 mt-1">PIN: ${u.pin ? '•••• (' + u.pin + ')' : 'Sin PIN'}</p>
        </td>
        <td class="p-4 text-center font-bold text-emerald-600 text-xs">
          ${daysWorked} días
        </td>
        <td class="p-4 text-center space-x-1">
          <button onclick="openEmployeeDetail('${u.id}')" class="px-2.5 py-1 bg-blue-100 text-blue-800 hover:bg-blue-200 rounded-lg font-bold text-[10px]">
            Expediente / Editar Ficha
          </button>
          <button onclick="deleteUser('${u.id}')" title="Eliminar" class="text-rose-500 hover:text-rose-700 p-1">
            <i data-lucide="trash-2" class="w-4 h-4 inline"></i>
          </button>
        </td>
      </tr>
    `;
  });
  if(window.lucide) lucide.createIcons();
}

function openInviteUserModal() { document.getElementById('modal-user').classList.remove('hidden'); }

function saveUser() {
  const name = document.getElementById('u-name').value;
  const phone = document.getElementById('u-phone').value;
  const email = document.getElementById('u-email').value;
  const address = document.getElementById('u-address').value;
  const emergency = document.getElementById('u-emergency').value;
  const role = document.getElementById('u-role').value;
  const pin = document.getElementById('u-pin').value.trim();

  if(!name) return alert('Por favor complete el nombre del empleado.');
  if(pin && (pin.length !== 4 || isNaN(pin))) return alert('El PIN debe tener exactamente 4 números.');

  if(pin && users.some(u => u.pin === pin)) {
    return alert('Este PIN ya está asignado a otro usuario.');
  }

  db.collection("users").add({ 
    name, phone, email, address, emergency, role, 
    pin: pin || null, 
    joined: new Date().toISOString().split('T')[0],
    attendance: [],
    idImage: null,
    dayRate: 0, bonus: 0, deduction: 0
  });

  closeModal('modal-user');
}

function openEmployeeDetail(empId) {
  selectedEmpForDetail = users.find(u => String(u.id) === String(empId));
  if(!selectedEmpForDetail) return alert('No se encontró la ficha del empleado.');

  document.getElementById('emp-edit-name').value = selectedEmpForDetail.name || '';
  document.getElementById('emp-edit-phone').value = selectedEmpForDetail.phone || '';
  document.getElementById('emp-edit-email').value = selectedEmpForDetail.email || '';
  document.getElementById('emp-edit-address').value = selectedEmpForDetail.address || '';
  document.getElementById('emp-edit-emergency').value = selectedEmpForDetail.emergency || '';
  document.getElementById('emp-edit-role').value = selectedEmpForDetail.role || 'Empleado';
  document.getElementById('emp-pin-edit').value = selectedEmpForDetail.pin || '';

  const imgContainer = document.getElementById('emp-id-container');
  if(selectedEmpForDetail.idImage) {
    imgContainer.innerHTML = `<img src="${selectedEmpForDetail.idImage}" class="max-h-32 mx-auto rounded-lg shadow-sm">`;
  } else {
    imgContainer.innerHTML = `<span class="text-slate-400">Sin documento subido</span>`;
  }

  const daysCount = selectedEmpForDetail.attendance ? selectedEmpForDetail.attendance.length : 0;
  document.getElementById('emp-days-count').innerText = `${daysCount} días registrados`;

  const logContainer = document.getElementById('emp-attendance-log');
  logContainer.innerHTML = '';
  if(selectedEmpForDetail.attendance && selectedEmpForDetail.attendance.length > 0) {
    selectedEmpForDetail.attendance.slice().reverse().forEach(entry => {
      logContainer.innerHTML += `<p class="text-slate-700">✓ Entró: ${entry}</p>`;
    });
  } else {
    logContainer.innerHTML = `<p class="text-slate-400 italic">Sin registros de entrada</p>`;
  }

  document.getElementById('payroll-day-rate').value = selectedEmpForDetail.dayRate || 0;
  document.getElementById('payroll-bonus').value = selectedEmpForDetail.bonus || 0;
  document.getElementById('payroll-deduction').value = selectedEmpForDetail.deduction || 0;

  calculatePayroll();
  document.getElementById('modal-employee-detail').classList.remove('hidden');
}

// ASISTENCIA MANUAL Y DIAS PASADOS
function addPastAttendanceDate() {
  if (!selectedEmpForDetail) return;

  const dateInput = document.getElementById('manual-attendance-date').value;
  if (!dateInput) return alert('Por favor, selecciona una fecha en el calendario.');

  const [year, month, day] = dateInput.split('-');
  const formattedDate = `${day}/${month}/${year}, 08:00:00 a. m. (Manual Pasado)`;

  let updatedAttendance = Array.from(selectedEmpForDetail.attendance || []);
  updatedAttendance.push(formattedDate);

  selectedEmpForDetail.attendance = updatedAttendance;

  db.collection("users").doc(selectedEmpForDetail.id).update({ 
    attendance: updatedAttendance 
  }).then(() => {
    document.getElementById('manual-attendance-date').value = '';
    openEmployeeDetail(selectedEmpForDetail.id);
  }).catch(error => {
    alert("Error al guardar la fecha en la nube.");
  });
}

function removeLastAttendance() {
  if (!selectedEmpForDetail || !selectedEmpForDetail.attendance || selectedEmpForDetail.attendance.length === 0) {
    return alert("No hay registros de asistencia para eliminar.");
  }

  let updatedAttendance = Array.from(selectedEmpForDetail.attendance);
  updatedAttendance.pop();

  selectedEmpForDetail.attendance = updatedAttendance;

  db.collection("users").doc(selectedEmpForDetail.id).update({ 
    attendance: updatedAttendance 
  }).then(() => {
    openEmployeeDetail(selectedEmpForDetail.id);
  }).catch(error => {
    alert("Error al actualizar la asistencia.");
  });
}

function resetQuincenaAttendance() {
  if (!selectedEmpForDetail) return;

  const confirmReset = confirm(`¿Deseas cerrar la quincena de ${selectedEmpForDetail.name} y reiniciar el contador a 0 días?`);
  
  if (confirmReset) {
    selectedEmpForDetail.attendance = [];

    db.collection("users").doc(selectedEmpForDetail.id).update({ 
      attendance: [] 
    }).then(() => {
      openEmployeeDetail(selectedEmpForDetail.id);
      alert('Quincena cerrada. Contador de días reiniciado a 0.');
    }).catch(error => {
      alert("Error al reiniciar quincena.");
    });
  }
}

function clearEmpPin() {
  document.getElementById('emp-pin-edit').value = '';
}

function uploadEmployeeID(event) {
  const file = event.target.files[0];
  if(!file || !selectedEmpForDetail) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    selectedEmpForDetail.idImage = e.target.result;
    document.getElementById('emp-id-container').innerHTML = `<img src="${e.target.result}" class="max-h-32 mx-auto rounded-lg shadow-sm">`;
    db.collection("users").doc(selectedEmpForDetail.id).update({ idImage: e.target.result });
  };
  reader.readAsDataURL(file);
}

function calculatePayroll() {
  if(!selectedEmpForDetail) return;
  const days = selectedEmpForDetail.attendance ? selectedEmpForDetail.attendance.length : 0;
  const rate = parseFloat(document.getElementById('payroll-day-rate').value) || 0;
  const bonus = parseFloat(document.getElementById('payroll-bonus').value) || 0;
  const deduction = parseFloat(document.getElementById('payroll-deduction').value) || 0;

  const total = (days * rate) + bonus - deduction;
  document.getElementById('payroll-total-display').innerText = `$${total.toFixed(2)}`;
}

function saveEmployeePayrollDetails() {
  if(!selectedEmpForDetail) return;

  const newName = document.getElementById('emp-edit-name').value.trim();
  const newPhone = document.getElementById('emp-edit-phone').value.trim();
  const newEmail = document.getElementById('emp-edit-email').value.trim();
  const newAddress = document.getElementById('emp-edit-address').value.trim();
  const newEmergency = document.getElementById('emp-edit-emergency').value.trim();
  const newRole = document.getElementById('emp-edit-role').value;
  const newPin = document.getElementById('emp-pin-edit').value.trim();

  if(!newName) return alert('El nombre del empleado no puede estar vacío.');

  if(newPin && (newPin.length !== 4 || isNaN(newPin))) {
    return alert('El PIN debe contener exactamente 4 números.');
  }
  
  if(newPin && users.some(u => String(u.id) !== String(selectedEmpForDetail.id) && u.pin === newPin)) {
    return alert('Este PIN ya está en uso por otro empleado.');
  }

  db.collection("users").doc(selectedEmpForDetail.id).update({
    name: newName,
    phone: newPhone,
    email: newEmail,
    address: newAddress,
    emergency: newEmergency,
    role: newRole,
    pin: newPin || null,
    dayRate: parseFloat(document.getElementById('payroll-day-rate').value) || 0,
    bonus: parseFloat(document.getElementById('payroll-bonus').value) || 0,
    deduction: parseFloat(document.getElementById('payroll-deduction').value) || 0
  }).then(() => {
    closeModal('modal-employee-detail');
    alert('¡Ficha del empleado actualizada con éxito!');
  });
}

function printPayrollVoucher() {
  if(!selectedEmpForDetail) return;

  const days = selectedEmpForDetail.attendance ? selectedEmpForDetail.attendance.length : 0;
  const rate = selectedEmpForDetail.dayRate || 0;
  const bonus = selectedEmpForDetail.bonus || 0;
  const deduction = selectedEmpForDetail.deduction || 0;
  const subtotalDays = days * rate;
  const netTotal = subtotalDays + bonus - deduction;

  document.getElementById('pay-print-date').innerText = new Date().toLocaleDateString();
  document.getElementById('pay-print-name').innerText = selectedEmpForDetail.name;
  document.getElementById('pay-print-role').innerText = selectedEmpForDetail.role;
  document.getElementById('pay-print-days').innerText = `${days} días`;
  document.getElementById('pay-print-rate').innerText = `$${rate.toFixed(2)}`;
  document.getElementById('pay-print-subtotal').innerText = `$${subtotalDays.toFixed(2)}`;
  document.getElementById('pay-print-bonus').innerText = `+$${bonus.toFixed(2)}`;
  document.getElementById('pay-print-deduction').innerText = `-$${deduction.toFixed(2)}`;
  document.getElementById('pay-print-total').innerText = `$${netTotal.toFixed(2)}`;

  document.getElementById('modal-payroll-print').classList.remove('hidden');
}

function deleteUser(id) {
  if(users.length <= 1) return alert('No puede eliminar al único usuario.');
  if(confirm('¿Eliminar este empleado de la nube?')) {
    db.collection("users").doc(id).delete();
  }
}

// 5. REPARACIONES Y SERVICIO TÉCNICO
function renderRepairs() {
  const grid = document.getElementById('repairs-grid');
  if(!grid) return;
  grid.innerHTML = '';

  repairs.forEach(r => {
    const statusColors = {
      'Pendiente': 'bg-amber-100 text-amber-800 border-amber-200',
      'En Proceso': 'bg-blue-100 text-blue-800 border-blue-200',
      'Listo': 'bg-emerald-100 text-emerald-800 border-emerald-200',
      'Entregado': 'bg-slate-100 text-slate-600 border-slate-200'
    };

    grid.innerHTML += `
      <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div class="flex justify-between items-start">
          <div>
            <span class="text-[10px] font-mono text-slate-400 font-bold">${r.code || 'REP'}</span>
            <h3 class="font-bold text-slate-900 text-sm">${r.device}</h3>
          </div>
          <span class="text-[10px] font-bold px-2.5 py-1 rounded-full border ${statusColors[r.status] || ''}">${r.status}</span>
        </div>
        <p class="text-xs text-slate-600"><span class="font-bold text-slate-700">Cliente:</span> ${r.client}</p>
        <p class="text-xs text-slate-600"><span class="font-bold text-slate-700">Tel/WhatsApp:</span> ${r.phone || 'No registrado'}</p>
        <p class="text-xs text-slate-600"><span class="font-bold text-slate-700">Falla:</span> ${r.issue}</p>
        <div class="flex justify-between items-center border-t pt-3 gap-2">
          <span class="font-extrabold text-emerald-600 text-sm">$${parseFloat(r.cost || 0).toFixed(2)}</span>
          
          <div class="flex items-center gap-1.5">
            <button onclick="openEditRepairModal('${r.id}')" title="Editar Información" class="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1">
              <i data-lucide="edit-3" class="w-3.5 h-3.5"></i> Editar
            </button>

            <select onchange="updateRepairStatus('${r.id}', this.value)" class="text-xs border rounded-lg p-1.5 bg-slate-50 font-medium">
              <option value="Pendiente" ${r.status==='Pendiente'?'selected':''}>Pendiente</option>
              <option value="En Proceso" ${r.status==='En Proceso'?'selected':''}>En Proceso</option>
              <option value="Listo" ${r.status==='Listo'?'selected':''}>Listo</option>
              <option value="Entregado" ${r.status==='Entregado'?'selected':''}>Entregado</option>
            </select>

            ${r.phone ? `
              <button onclick="sendWhatsAppNotification('${r.id}')" title="Notificar por WhatsApp" class="p-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition">
                <i data-lucide="message-circle" class="w-4 h-4"></i>
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  });
  if(window.lucide) lucide.createIcons();
}

function openAddRepairModal() { 
  document.getElementById('repair-modal-title').innerText = 'Registrar Orden de Servicio';
  document.getElementById('r-editing-id').value = '';
  document.getElementById('r-client').value = '';
  document.getElementById('r-phone').value = '';
  document.getElementById('r-device').value = '';
  document.getElementById('r-issue').value = '';
  document.getElementById('r-cost').value = '';
  document.getElementById('r-status').value = 'Pendiente';
  document.getElementById('modal-repair').classList.remove('hidden'); 
}

function openEditRepairModal(repairId) {
  const r = repairs.find(item => item.id === repairId);
  if(!r) return;

  document.getElementById('repair-modal-title').innerText = 'Editar Orden';
  document.getElementById('r-editing-id').value = r.id;
  document.getElementById('r-client').value = r.client || '';
  document.getElementById('r-phone').value = r.phone || '';
  document.getElementById('r-device').value = r.device || '';
  document.getElementById('r-issue').value = r.issue || '';
  document.getElementById('r-cost').value = r.cost || 0;
  document.getElementById('r-status').value = r.status || 'Pendiente';

  document.getElementById('modal-repair').classList.remove('hidden');
}

function saveRepair() {
  const editingId = document.getElementById('r-editing-id').value;
  const client = document.getElementById('r-client').value;
  const phone = document.getElementById('r-phone').value.replace(/[^0-9]/g, '');
  const device = document.getElementById('r-device').value;
  const issue = document.getElementById('r-issue').value;
  const cost = parseFloat(document.getElementById('r-cost').value) || 0;
  const status = document.getElementById('r-status').value;

  if(!client || !device) return alert('Ingresa los datos requeridos.');

  if(editingId) {
    db.collection("repairs").doc(editingId).update({ client, phone, device, issue, cost, status });
  } else {
    db.collection("repairs").add({ 
      code: 'R-' + Math.floor(100 + Math.random() * 900), 
      client, phone, device, issue, cost, status 
    });
  }

  closeModal('modal-repair');
}

function updateRepairStatus(id, newStatus) {
  db.collection("repairs").doc(id).update({ status: newStatus });
  const repair = repairs.find(r => r.id === id);
  if(newStatus === 'Listo' && repair && repair.phone) {
    if (confirm(`El servicio está LISTO. ¿Enviar notificación de WhatsApp al cliente (${repair.client})?`)) {
      sendWhatsAppNotification(id);
    }
  }
}

function sendWhatsAppNotification(repairId) {
  const r = repairs.find(item => item.id === repairId);
  if(!r || !r.phone) return alert('No hay número de WhatsApp registrado.');

  const message = `Hola ${r.client}! 👋 Le informamos desde LK SmartPhone Tecno que su equipo (${r.device}) ya se encuentra LISTO para retirar. Total: $${parseFloat(r.cost || 0).toFixed(2)}. ¡Le esperamos!`;
  const encodedMsg = encodeURIComponent(message);
  window.open(`https://wa.me/${r.phone}?text=${encodedMsg}`, '_blank');
}

// 6. POS Y INVENTARIO
function renderPosProducts() {
  const searchInput = document.getElementById('pos-search');
  if(!searchInput) return;
  const query = searchInput.value.toLowerCase();
  const grid = document.getElementById('pos-products-grid');
  if(!grid) return;
  grid.innerHTML = '';

  inventory.filter(p => (activeCategory === 'All' || p.category === activeCategory) && (p.name.toLowerCase().includes(query) || (p.code && p.code.toLowerCase().includes(query))))
    .forEach(p => {
      grid.innerHTML += `
        <div onclick="addToCart('${p.id}')" class="bg-slate-900/60 border border-slate-700/60 rounded-xl p-3 cursor-pointer hover:border-pink-500 hover:scale-[1.02] transition">
          <span class="text-[9px] font-bold px-2 py-0.5 rounded bg-pink-500/20 brand-pink uppercase">${p.category}</span>
          <h4 class="font-bold text-white text-xs mt-2 line-clamp-1">${p.name}</h4>
          <p class="text-[10px] text-slate-400 font-mono">${p.code || ''}</p>
          <div class="flex justify-between items-center mt-3">
            <span class="font-extrabold text-emerald-400 text-xs">$${parseFloat(p.price).toFixed(2)}</span>
            <span class="text-[10px] font-bold ${p.stock < 3 ? 'text-rose-400' : 'text-slate-400'}">Stk: ${p.stock}</span>
          </div>
        </div>
      `;
    });
}

function addToCart(productId) {
  const prod = inventory.find(p => p.id === productId);
  if(!prod || prod.stock <= 0) return alert('Sin stock disponible');
  const itemInCart = cart.find(item => item.id === productId);
  if(itemInCart) {
    if(itemInCart.qty < prod.stock) itemInCart.qty++;
    else alert('Límite de stock alcanzado');
  } else { cart.push({ ...prod, qty: 1 }); }
  renderCart();
}

function updateCartQty(id, delta) {
  const item = cart.find(i => i.id === id);
  const prod = inventory.find(p => p.id === id);
  if(item) {
    item.qty += delta;
    if(item.qty > prod.stock) item.qty = prod.stock;
    if(item.qty <= 0) cart = cart.filter(i => i.id !== id);
  }
  renderCart();
}

function clearCart() { cart = []; renderCart(); }

function renderCart() {
  const container = document.getElementById('cart-items');
  if(!container) return;
  container.innerHTML = '';
  let subtotal = 0;

  if(cart.length === 0) {
    container.innerHTML = `<p class="text-slate-400 text-center py-10 text-xs">El carrito está vacío</p>`;
  } else {
    cart.forEach(item => {
      subtotal += item.price * item.qty;
      container.innerHTML += `
        <div class="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl text-xs border border-slate-100">
          <div class="flex-1 pr-2">
            <p class="font-bold text-slate-800 line-clamp-1">${item.name}</p>
            <p class="text-[10px] text-slate-500">$${item.price.toFixed(2)} x ${item.qty}</p>
          </div>
          <div class="flex items-center gap-1.5">
            <button onclick="updateCartQty('${item.id}', -1)" class="w-6 h-6 bg-slate-200 hover:bg-slate-300 rounded-lg font-bold">-</button>
            <span class="font-bold px-1">${item.qty}</span>
            <button onclick="updateCartQty('${item.id}', 1)" class="w-6 h-6 bg-slate-200 hover:bg-slate-300 rounded-lg font-bold">+</button>
          </div>
        </div>
      `;
    });
  }

  document.getElementById('cart-subtotal').innerText = `$${subtotal.toFixed(2)}`;
  document.getElementById('cart-total').innerText = `$${subtotal.toFixed(2)}`;
}

function processCheckout() {
  if(cart.length === 0) return alert('El carrito está vacío');
  const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const method = document.getElementById('cart-payment-method').value;
  const saleCode = 'VEN-' + Math.floor(1000 + Math.random() * 9000);
  const date = new Date().toLocaleString();

  cart.forEach(cartItem => {
    const prod = inventory.find(p => p.id === cartItem.id);
    if(prod) {
      const newStock = Math.max(0, prod.stock - cartItem.qty);
      db.collection("inventory").doc(prod.id).update({ stock: newStock });
    }
  });

  db.collection("sales").add({ code: saleCode, date, items: cart, total, method });

  document.getElementById('rec-id').innerText = saleCode;
  document.getElementById('rec-date').innerText = date;
  document.getElementById('rec-method').innerText = method;
  document.getElementById('rec-total').innerText = `$${total.toFixed(2)}`;

  const recItems = document.getElementById('rec-items');
  recItems.innerHTML = '';
  cart.forEach(i => {
    recItems.innerHTML += `<div class="flex justify-between"><span>${i.name} (x${i.qty})</span><span>$${(i.price * i.qty).toFixed(2)}</span></div>`;
  });

  clearCart();
  document.getElementById('modal-receipt').classList.remove('hidden');
}

function renderInventory() {
  const invSearch = document.getElementById('inv-search');
  if(!invSearch) return;
  const query = invSearch.value.toLowerCase();
  const tbody = document.getElementById('inventory-table-body');
  if(!tbody) return;
  tbody.innerHTML = '';

  inventory.filter(p => p.name.toLowerCase().includes(query) || (p.code && p.code.toLowerCase().includes(query)))
    .forEach(p => {
      const isAdmin = currentUser && currentUser.role === 'Administrador';
      tbody.innerHTML += `
        <tr class="hover:bg-slate-50">
          <td class="p-4 font-bold text-slate-800">${p.name}</td>
          <td class="p-4"><span class="px-2 py-1 bg-slate-100 rounded-lg text-[10px] font-bold text-slate-600">${p.category}</span></td>
          <td class="p-4 text-slate-500 font-mono text-[11px]">${p.code || ''}</td>
          <td class="p-4 font-extrabold text-emerald-600">$${parseFloat(p.price).toFixed(2)}</td>
          <td class="p-4 font-bold ${p.stock < 3 ? 'text-rose-500' : 'text-slate-700'}">${p.stock}</td>
          <td class="p-4 text-center admin-only space-x-1">
            ${isAdmin ? `
              <button onclick="openEditProductModal('${p.id}')" title="Editar Producto" class="p-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg font-bold">
                <i data-lucide="edit-3" class="w-4 h-4 inline"></i>
              </button>
              <button onclick="deleteProduct('${p.id}')" title="Eliminar Producto" class="p-1 text-rose-500 hover:text-rose-700">
                <i data-lucide="trash-2" class="w-4 h-4 inline"></i>
              </button>
            ` : '-'}
          </td>
        </tr>
      `;
    });
  if(window.lucide) lucide.createIcons();
}

function openAddProductModal() { 
  document.getElementById('product-modal-title').innerText = 'Agregar Nuevo Producto';
  document.getElementById('p-editing-id').value = '';
  document.getElementById('p-name').value = '';
  document.getElementById('p-cat').value = 'Teléfonos';
  document.getElementById('p-code').value = '';
  document.getElementById('p-price').value = '';
  document.getElementById('p-stock').value = '';
  document.getElementById('modal-product').classList.remove('hidden'); 
}

function openEditProductModal(productId) {
  const prod = inventory.find(p => p.id === productId);
  if(!prod) return;

  document.getElementById('product-modal-title').innerText = 'Editar Producto';
  document.getElementById('p-editing-id').value = prod.id;
  document.getElementById('p-name').value = prod.name || '';
  document.getElementById('p-cat').value = prod.category || 'Teléfonos';
  document.getElementById('p-code').value = prod.code || '';
  document.getElementById('p-price').value = prod.price || 0;
  document.getElementById('p-stock').value = prod.stock || 0;

  document.getElementById('modal-product').classList.remove('hidden');
}

function saveProduct() {
  const editingId = document.getElementById('p-editing-id').value;
  const name = document.getElementById('p-name').value;
  const category = document.getElementById('p-cat').value;
  const code = document.getElementById('p-code').value;
  const price = parseFloat(document.getElementById('p-price').value);
  const stock = parseInt(document.getElementById('p-stock').value);

  if(!name || isNaN(price)) return alert('Campos requeridos vacíos');

  if(editingId) {
    db.collection("inventory").doc(editingId).update({ name, category, code, price, stock });
  } else {
    db.collection("inventory").add({ name, category, code, price, stock });
  }

  closeModal('modal-product');
}

function deleteProduct(id) {
  if(confirm('¿Eliminar producto de la nube?')) { db.collection("inventory").doc(id).delete(); }
}

function renderHistory() {
  const tbody = document.getElementById('history-table-body');
  if(!tbody) return;
  tbody.innerHTML = '';
  sales.forEach(s => {
    tbody.innerHTML += `
      <tr class="hover:bg-slate-50">
        <td class="p-4 font-mono font-bold brand-pink text-xs">${s.code || 'VEN'}</td>
        <td class="p-4 text-[11px] text-slate-500">${s.date}</td>
        <td class="p-4 text-xs font-medium">${s.items ? s.items.map(i => `${i.name} (x${i.qty})`).join(', ') : ''}</td>
        <td class="p-4 text-xs font-semibold">${s.method}</td>
        <td class="p-4 font-extrabold text-emerald-600 text-xs">$${parseFloat(s.total || 0).toFixed(2)}</td>
      </tr>
    `;
  });
}

function renderDashboard() {
  const totalSalesToday = sales.reduce((sum, s) => sum + parseFloat(s.total || 0), 0);
  const pendingRepairsCount = repairs.filter(r => r.status !== 'Entregado').length;
  const lowStockCount = inventory.filter(p => p.stock < 3).length;

  document.getElementById('dash-today-sales').innerText = `$${totalSalesToday.toFixed(2)}`;
  document.getElementById('dash-pending-repairs').innerText = pendingRepairsCount;
  document.getElementById('dash-low-stock').innerText = lowStockCount;
  document.getElementById('dash-active-users').innerText = users.length;
}

// 7. ESCÁNER Y NAVEGACIÓN
function startCameraScanner(target) {
  activeScanTarget = target;
  document.getElementById('modal-scanner').classList.remove('hidden');

  if (!html5QrCode) html5QrCode = new Html5Qrcode("interactive-camera");

  const config = { fps: 10, qrbox: { width: 250, height: 150 } };
  html5QrCode.start({ facingMode: "environment" }, config, (decodedText) => {
    handleScannedCode(decodedText.trim());
    stopCameraScanner();
  }, () => {}).catch(err => {
    alert("Error al abrir cámara: " + err);
    stopCameraScanner();
  });
}

function stopCameraScanner() {
  if (html5QrCode && html5QrCode.isScanning) {
    html5QrCode.stop().then(() => document.getElementById('modal-scanner').classList.add('hidden')).catch(() => document.getElementById('modal-scanner').classList.add('hidden'));
  } else {
    document.getElementById('modal-scanner').classList.add('hidden');
  }
}

function handleScannedCode(code) {
  if (activeScanTarget === 'pos') {
    const prod = inventory.find(p => p.code && p.code.toLowerCase() === code.toLowerCase());
    if (prod) addToCart(prod.id);
    else { document.getElementById('pos-search').value = code; renderPosProducts(); }
  } else if (activeScanTarget === 'inventory') {
    document.getElementById('inv-search').value = code;
    renderInventory();
  }
}

function switchTab(tabId) {
  document.querySelectorAll('main > section').forEach(el => el.classList.add('hidden'));
  document.getElementById(`tab-${tabId}`).classList.remove('hidden');

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('bg-brand-pink', 'text-white');
    btn.classList.add('bg-slate-800', 'text-slate-300');
  });

  const activeNav = document.getElementById(`nav-${tabId}`);
  if(activeNav) {
    activeNav.classList.remove('bg-slate-800', 'text-slate-300');
    activeNav.classList.add('bg-brand-pink', 'text-white');
  }

  if(tabId === 'dashboard') renderDashboard();
  if(tabId === 'pos') renderPosProducts();
  if(tabId === 'inventory') renderInventory();
  if(tabId === 'repairs') renderRepairs();
  if(tabId === 'history') renderHistory();
  if(tabId === 'users') renderUsers();
}

function filterPosCat(cat) { activeCategory = cat; renderPosProducts(); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// 8. EVENTOS AL CARGAR LA PÁGINA
window.onload = function() {
  initCloudSync();
  if(window.lucide) lucide.createIcons();

  const pinInput = document.getElementById('pin-input');
  if(pinInput) {
    pinInput.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') submitPin();
    });
  }
};
// FUNCIONES DE ARQUEO Y CIERRE DE CAJA DIARIO
function openShiftCloseModal() {
  // Verificar si el usuario actual es Administrador
  if (!currentUser || currentUser.role !== 'Administrador') {
    return alert('Acceso denegado. Solo los Administradores pueden realizar el Cierre de Caja.');
  }

  const todayStr = new Date().toLocaleDateString();
  const todaySales = sales.filter(s => s.date && s.date.includes(todayStr));

  let cashTotal = 0;
  let digitalTotal = 0;

  todaySales.forEach(s => {
    const amount = parseFloat(s.total || 0);
    if (s.method === 'Efectivo') {
      cashTotal += amount;
    } else {
      digitalTotal += amount;
    }
  });

  document.getElementById('shift-cash-system').innerText = `$${cashTotal.toFixed(2)}`;
  document.getElementById('shift-digital-system').innerText = `$${digitalTotal.toFixed(2)}`;
  document.getElementById('shift-total-system').innerText = `$${(cashTotal + digitalTotal).toFixed(2)}`;

  document.getElementById('shift-cash-counted').value = '';
  document.getElementById('shift-difference').innerText = '$0.00';
  document.getElementById('shift-notes').value = '';

  window.currentShiftData = { cashTotal, digitalTotal, total: cashTotal + digitalTotal };
  document.getElementById('modal-shift-close').classList.remove('hidden');
}
function openShiftCloseModal() {
  const todayStr = new Date().toLocaleDateString();
  const todaySales = sales.filter(s => s.date && s.date.includes(todayStr));

  let cashTotal = 0;
  let digitalTotal = 0;

  todaySales.forEach(s => {
    const amount = parseFloat(s.total || 0);
    if (s.method === 'Efectivo') {
      cashTotal += amount;
    } else {
      digitalTotal += amount;
    }
  });

  document.getElementById('shift-cash-system').innerText = `$${cashTotal.toFixed(2)}`;
  document.getElementById('shift-digital-system').innerText = `$${digitalTotal.toFixed(2)}`;
  document.getElementById('shift-total-system').innerText = `$${(cashTotal + digitalTotal).toFixed(2)}`;

  document.getElementById('shift-cash-counted').value = '';
  document.getElementById('shift-difference').innerText = '$0.00';
  document.getElementById('shift-notes').value = '';

  window.currentShiftData = { cashTotal, digitalTotal, total: cashTotal + digitalTotal };
  document.getElementById('modal-shift-close').classList.remove('hidden');
}

function calculateShiftDifference() {
  const counted = parseFloat(document.getElementById('shift-cash-counted').value) || 0;
  const expected = window.currentShiftData ? window.currentShiftData.cashTotal : 0;
  const diff = counted - expected;

  const diffEl = document.getElementById('shift-difference');
  if (diff === 0) {
    diffEl.innerText = "$0.00 (Cuadre Perfecto)";
    diffEl.className = "font-bold text-emerald-600";
  } else if (diff > 0) {
    diffEl.innerText = `+$${diff.toFixed(2)} (Sobrante)`;
    diffEl.className = "font-bold text-blue-600";
  } else {
    diffEl.innerText = `-$${Math.abs(diff).toFixed(2)} (Faltante)`;
    diffEl.className = "font-bold text-rose-600";
  }
}

function saveShiftClosure() {
  const counted = parseFloat(document.getElementById('shift-cash-counted').value);
  if (isNaN(counted)) return alert('Ingrese el efectivo contado en caja.');

  const notes = document.getElementById('shift-notes').value;
  const expected = window.currentShiftData ? window.currentShiftData.cashTotal : 0;
  const difference = counted - expected;

  db.collection("daily_closures").add({
    date: new Date().toLocaleString(),
    user: currentUser ? currentUser.name : 'Desconocido',
    systemCash: expected,
    systemDigital: window.currentShiftData ? window.currentShiftData.digitalTotal : 0,
    systemTotal: window.currentShiftData ? window.currentShiftData.total : 0,
    countedCash: counted,
    difference: difference,
    notes: notes
  }).then(() => {
    alert('¡Cierre de Caja registrado con éxito en la nube!');
    closeModal('modal-shift-close');
  }).catch(err => {
    alert('Error al guardar el cierre de caja: ' + err);
  });
}
