/* TodoList — Victor Rivera
 */

// const API = "http://localhost:8080"; // para local
const API = "https://mitodo-backend-production.up.railway.app"; // para publico

// Estado global con persistencia en localStorage
let auth        = localStorage.getItem("auth") || null;
let currentUser = JSON.parse(localStorage.getItem("currentUser")) || null;
let allCategories = [];   
let allTags       = [];   
let allTasks = [];        
let editingTaskId = null; 
let currentFilterCatName = null;  
let currentFilterTagName = null;

// Referencias DOM
const authView  = document.getElementById("auth-view");
const appView   = document.getElementById("app-view");
const toastBox  = document.getElementById("toast-container");

// Init
document.addEventListener("DOMContentLoaded", async () => {
    // Auth
    document.getElementById("btn-login").addEventListener("click", handleLogin);
    document.getElementById("btn-register").addEventListener("click", handleRegister);
    document.getElementById("btn-logout").addEventListener("click", logout);
    document.getElementById("link-to-register").addEventListener("click", e => { e.preventDefault(); showPanel("register"); });
    document.getElementById("link-to-login").addEventListener("click",    e => { e.preventDefault(); showPanel("login"); });

    // Enter en inputs de auth
    ["login-username","login-password"].forEach(id =>
        document.getElementById(id).addEventListener("keydown", e => { if (e.key === "Enter") handleLogin(); })
    );

    // Tarea
    document.getElementById("btn-guardar-tarea").addEventListener("click", handleSaveNewTask);
    document.getElementById("btn-cancel-edit").addEventListener("click", cancelEdit);

    // Categoría
    document.getElementById("btn-crear-cat").addEventListener("click", handleCreateCategory);
    document.getElementById("nueva-cat-titulo").addEventListener("keydown", e => { if (e.key === "Enter") handleCreateCategory(); });

    // Tag
    document.getElementById("btn-crear-tag").addEventListener("click", handleCreateTag);
    document.getElementById("nuevo-tag-nombre").addEventListener("keydown", e => { if (e.key === "Enter") handleCreateTag(); });

    // Perfil
    document.getElementById("btn-update-profile").addEventListener("click", handleUpdateProfile);

    // Buscador
    document.getElementById("search-type").addEventListener("change", ajustarBuscador);
    document.getElementById("btn-buscar").addEventListener("click", ejecutarBusqueda);
    document.getElementById("btn-limpiar-filtros").addEventListener("click", limpiarFiltros);

    // Modal editar
    document.getElementById("modal-close").addEventListener("click",  closeModal);
    document.getElementById("modal-cancel").addEventListener("click", closeModal);
    document.getElementById("modal-save").addEventListener("click",   handleModalSave);
    document.getElementById("modal-overlay").addEventListener("click", e => { if (e.target === document.getElementById("modal-overlay")) closeModal(); });

    // Lógica del botón de Tema
    const btnTheme = document.getElementById("btn-theme-toggle");
    if (localStorage.getItem("theme") === "light") {
        document.body.classList.add("light-theme");
    }

    btnTheme.addEventListener("click", () => {
        document.body.classList.toggle("light-theme");
        const isLight = document.body.classList.contains("light-theme");
        localStorage.setItem("theme", isLight ? "light" : "dark");
    });

    // Restaurar sesión si existe
    if (auth && currentUser) {
        document.getElementById("user-greeting").textContent = "Hola, " + currentUser.fullname;
        authView.classList.remove("active-view");
        appView.classList.add("active-view");
        await cargarApp();
    }
});


//  TOASTS
function toast(msg, type = "info") {
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = msg;
    toastBox.appendChild(el);
    setTimeout(() => el.remove(), 4000);
}


//  AUTH
function showPanel(name) {
    document.getElementById("panel-login").classList.toggle("hidden", name !== "login");
    document.getElementById("panel-register").classList.toggle("hidden", name !== "register");
}

async function handleLogin() {
    const u = document.getElementById("login-username").value.trim();
    const p = document.getElementById("login-password").value.trim();
    if (!u || !p) { toast("Rellena usuario y contraseña", "error"); return; }

    const header = "Basic " + btoa(u + ":" + p);
    
    try {
        const res = await fetch(API + "/dashboard", { headers: { Authorization: header } });
        if (res.status === 401) { toast("Credenciales incorrectas", "error"); return; }

        auth = header;
        currentUser = { username: u, fullname: u, role: "USER" };
        
        // Guardar sesión en el navegador
        localStorage.setItem("auth", auth);
        localStorage.setItem("currentUser", JSON.stringify(currentUser));

        document.getElementById("user-greeting").textContent = "Hola, " + u;

        authView.classList.remove("active-view");
        appView.classList.add("active-view");
        toast("Sesión iniciada", "success");
        await cargarApp();
    } catch { toast("No se puede conectar con el servidor", "error"); }
}

async function handleRegister() {
    const cmd = {
        username: document.getElementById("reg-username").value.trim(),
        email:    document.getElementById("reg-email").value.trim(),
        fullname: document.getElementById("reg-fullname").value.trim(),
        password: document.getElementById("reg-password").value.trim()
    };
    if (!cmd.username || !cmd.email || !cmd.password) { toast("Completa todos los campos", "error"); return; }

    try {
        const res = await fetch(API + "/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(cmd)
        });
        if (res.ok) {
            toast("Cuenta creada — ya puedes iniciar sesión", "success");
            document.getElementById("reg-username").value = "";
            document.getElementById("reg-email").value    = "";
            document.getElementById("reg-fullname").value = "";
            document.getElementById("reg-password").value = "";
            showPanel("login");
            document.getElementById("login-username").value = cmd.username;
        } else {
            const body = await res.json().catch(() => ({}));
            toast(body.detail || "El usuario o email ya existen", "error");
        }
    } catch { toast("Error de red", "error"); }
}

function logout() {
    auth = null; currentUser = null;
    localStorage.removeItem("auth");
    localStorage.removeItem("currentUser");
    
    appView.classList.remove("active-view");
    authView.classList.add("active-view");
    document.getElementById("login-username").value = "";
    document.getElementById("login-password").value = "";
}


//  CARGA INICIAL
async function cargarApp() {
    await Promise.all([cargarCategorias(), cargarTags(), cargarDashboard()]);
    await cargarTareas();
}

async function cargarDashboard() {
    try {
        const res = await apiFetch("/dashboard");
        if (!res.ok) return;
        const d = await res.json();
        
        set("stat-total",     d.totalTasks     ?? 0);
        set("stat-completed", d.completedTasks ?? 0);
        set("stat-pending",   d.pendingTasks   ?? 0);
        set("stat-overdue",   d.overdueTask    ?? 0);
        set("stat-today",     d.createdToday   ?? 0);

        if (currentUser && d.role) {
            currentUser.role = d.role;
            localStorage.setItem("currentUser", JSON.stringify(currentUser));
            actualizarRolBadge();
        }
    } catch {}
}

async function cargarCategorias() {
    try {
        const res = await apiFetch("/categories");
        if (!res.ok) return;
        allCategories = await res.json();
        rellenarSelectCategorias();
        renderChipsCategorias();

        if (currentUser && (currentUser.role === "ADMIN" || currentUser.role === "GESTOR")) {
            document.getElementById("admin-cat-form").classList.remove("hidden");
        }
    } catch {}
}

function rellenarSelectCategorias() {
    const selects = [
        document.getElementById("tarea-categoria"),
        document.getElementById("search-category-sel"),
        document.getElementById("modal-categoria")
    ];
    selects.forEach(sel => {
        const prev = sel.value;
        sel.innerHTML = '<option value="">Sin categoría</option>';
        allCategories.forEach(c => {
            const op = document.createElement("option");
            op.value = c.id; op.textContent = c.title;
            sel.appendChild(op);
        });
        sel.value = prev;
    });
}

function renderChipsCategorias() {
    const wrap = document.getElementById("cat-list");
    wrap.innerHTML = "";
    
    const allChip = document.createElement("span");
    allChip.className = "chip" + (currentFilterCatName === null ? " active" : "");
    allChip.textContent = "Todas";
    allChip.onclick = () => { 
        currentFilterCatName = null; 
        applyFiltersAndRender(); 
        renderChipsCategorias(); 
    };
    wrap.appendChild(allChip);

    allCategories.forEach(c => {
        const chip = document.createElement("span");
        chip.className = "chip" + (currentFilterCatName === c.title ? " active" : "");
        chip.textContent = c.title;
        chip.style.cursor = "pointer";
        
        chip.onclick = () => {
            currentFilterCatName = c.title; 
            applyFiltersAndRender(); 
            renderChipsCategorias(); 
        };
        wrap.appendChild(chip);
    });
}

async function handleCreateCategory() {
    const input = document.getElementById("nueva-cat-titulo");
    const title = input.value.trim();
    if (!title) return;

    let res = await apiFetch("/manager/categories", "POST", { title });
    if (res.status === 403) res = await apiFetch("/admin/categories", "POST", { title });

    if (res.ok) {
        toast("Categoría creada", "success");
        input.value = "";
        await cargarCategorias();
    } else {
        toast("Solo ADMIN o GESTOR pueden crear categorías", "error");
    }
}

async function cargarTags() {
    try {
        const res = await apiFetch("/tag");
        if (!res.ok) return;
        allTags = await res.json();
        renderChipsTags();
    } catch {}
}

function renderChipsTags() {
    const wrap = document.getElementById("tags-container");
    wrap.innerHTML = "";
    if (allTags.length === 0) {
        wrap.innerHTML = '<span style="font-size:0.8rem;color:var(--text-dim)">Sin tags aún</span>';
        return;
    }

    allTags.forEach(tag => {
        const chip = document.createElement("span");
        
        chip.className = "chip tag" + (currentFilterTagName === tag.name ? " active" : "");
        chip.innerHTML = `#${tag.name} <span class="chip-del" data-id="${tag.id}" title="Eliminar">✕</span>`;

        chip.onclick = () => {
            currentFilterTagName = (currentFilterTagName === tag.name) ? null : tag.name;
            applyFiltersAndRender(); 
            renderChipsTags();       
        };

        chip.querySelector(".chip-del").addEventListener("click", async e => {
            e.stopPropagation();
            await apiFetch("/tag/" + tag.id, "DELETE");
            await cargarTags();
        });
        
        wrap.appendChild(chip);
    });
}

async function handleCreateTag() {
    const input = document.getElementById("nuevo-tag-nombre");
    const name  = input.value.trim();
    if (!name) return;
    const res = await apiFetch("/tag", "POST", { name });
    if (res.ok) {
        toast("Tag creado", "success");
        input.value = "";
        await cargarTags();
    } else { toast("Error al crear tag", "error"); }
}

async function handleUpdateProfile() {
    const cmd = {};
    const email    = document.getElementById("profile-email").value.trim();
    const fullname = document.getElementById("profile-fullname").value.trim();
    const password = document.getElementById("profile-password").value.trim();
    if (email)    cmd.email    = email;
    if (fullname) cmd.fullname = fullname;
    if (password) cmd.password = password;
    if (!Object.keys(cmd).length) { toast("No hay cambios que guardar", "info"); return; }

    const res = await apiFetch("/user/profile", "PUT", cmd);
    if (res.ok) {
        toast("Perfil actualizado", "success");
        if (fullname) { 
            currentUser.fullname = fullname; 
            document.getElementById("user-greeting").textContent = "Hola, " + fullname; 
            localStorage.setItem("currentUser", JSON.stringify(currentUser));
        }
        document.getElementById("profile-password").value = "";
        
        if (password && currentUser) {
            auth = "Basic " + btoa(currentUser.username + ":" + password);
            localStorage.setItem("auth", auth);
        }
    } else { toast("Error al actualizar perfil", "error"); }
}


//  TAREAS
async function cargarTareas() {
    try {
        const res = await apiFetch("/task");
        const wrap = document.getElementById("lista-tareas");
        if (!res.ok) { wrap.innerHTML = '<p class="empty-state">Error cargando tareas</p>'; return; }
        
        allTasks = await res.json(); 
        applyFiltersAndRender();     
    } catch { 
        document.getElementById("lista-tareas").innerHTML = '<p class="empty-state">Error de red</p>'; 
    }
}

function applyFiltersAndRender() {
    const listaFiltrada = allTasks.filter(t => {
        const matchCat = currentFilterCatName ? (t.category === currentFilterCatName) : true;
        const taskTags = Array.isArray(t.tags) ? t.tags : Array.from(t.tags || []);
        const matchTag = currentFilterTagName ? taskTags.includes(currentFilterTagName) : true;

        return matchCat && matchTag; 
    });

    renderTareas(listaFiltrada);
}

function renderTareas(tareas) {
    const wrap = document.getElementById("lista-tareas");
    set("tasks-count", tareas.length);
    wrap.innerHTML = "";

    if (!tareas.length) {
        wrap.innerHTML = '<p class="empty-state">No hay tareas que mostrar</p>';
        return;
    }

    tareas.forEach(t => {
        const item = document.createElement("div");
        item.className = "task-item" + (t.completed || t.status === "DONE" ? " is-done" : "");

        const bar = document.createElement("div");
        bar.className = "task-priority-bar " + (t.priority || "MEDIUM");

        const body = document.createElement("div");
        body.className = "task-body";

        const title = document.createElement("div");
        title.className = "task-title";
        title.textContent = t.title;

        const desc = document.createElement("div");
        desc.className = "task-desc";
        desc.textContent = t.description || "Sin descripción";

        const meta = document.createElement("div");
        meta.className = "task-meta";

        meta.appendChild(badge("p-" + t.priority, labelPriority(t.priority)));
        meta.appendChild(badge("s-" + t.status,   labelStatus(t.status)));

        if (t.category) {
            meta.appendChild(badge("cat", "📁 " + t.category));
        }
        if (t.tags && t.tags.size !== 0) {
            const tagsArr = Array.isArray(t.tags) ? t.tags : [...t.tags];
            tagsArr.forEach(tagName => meta.appendChild(badge("tag", "#" + tagName)));
        }
        if (t.deadline) {
            const dl = badge("deadline", "⏰ " + formatDeadline(t.deadline));
            if (isOverdue(t)) dl.classList.add("overdue");
            meta.appendChild(dl);
        }

        body.appendChild(title);
        body.appendChild(desc);
        body.appendChild(meta);

        const actions = document.createElement("div");
        actions.className = "task-actions";

        const btnEdit = document.createElement("button");
        btnEdit.className = "btn btn-ghost btn-sm";
        btnEdit.textContent = "✎";
        btnEdit.title = "Editar";
        btnEdit.addEventListener("click", () => openModal(t));

        const btnToggle = document.createElement("button");
        const done = t.completed || t.status === "DONE";
        btnToggle.className = "btn btn-sm " + (done ? "btn-ghost" : "btn-success");
        btnToggle.textContent = done ? "Deshacer" : "✓ Hecho";
        btnToggle.addEventListener("click", () => toggleTask(t));

        const btnDel = document.createElement("button");
        btnDel.className = "btn btn-danger btn-sm";
        btnDel.textContent = "✕";
        btnDel.title = "Eliminar";
        btnDel.addEventListener("click", () => deleteTask(t.id));

        actions.appendChild(btnEdit);
        actions.appendChild(btnToggle);
        actions.appendChild(btnDel);

        item.appendChild(bar);
        item.appendChild(body);
        item.appendChild(actions);
        wrap.appendChild(item);
    });
}

async function handleSaveNewTask() {
    const titleEl = document.getElementById("tarea-titulo");
    const errorEl = document.getElementById("error-titulo");
    const titleVal = titleEl.value.trim();

    if (!titleVal) {
        titleEl.style.borderColor = "var(--red)";
        errorEl.classList.add("visible");
        titleEl.focus();
        return;
    }
    titleEl.style.borderColor = "";
    errorEl.classList.remove("visible");

    const rawDeadline = document.getElementById("tarea-deadline").value;
    const catId = document.getElementById("tarea-categoria").value;

    const cmd = {
        title:       titleVal,
        description: document.getElementById("tarea-descripcion").value.trim() || null,
        completed:   false,
        deadline:    rawDeadline ? (rawDeadline.length === 16 ? rawDeadline + ":00" : rawDeadline.slice(0, 19)) : null,
        priority:    document.getElementById("tarea-prioridad").value,
        status:      document.getElementById("tarea-status").value,
        categoryId:  catId ? parseInt(catId) : null
    };

    const res = await apiFetch("/task", "POST", cmd);
    if (res.ok) {
        toast("Tarea creada", "success");
        document.getElementById("tarea-titulo").value       = "";
        document.getElementById("tarea-descripcion").value  = "";
        document.getElementById("tarea-deadline").value     = "";
        document.getElementById("tarea-prioridad").value    = "MEDIUM";
        document.getElementById("tarea-status").value       = "PENDING";
        document.getElementById("tarea-categoria").value    = "";
        await cargarDashboard();
        await cargarTareas();
    } else { toast("Error al crear la tarea", "error"); }
}

function cancelEdit() {
    editingTaskId = null;
    document.getElementById("form-title").textContent = "Nueva tarea";
    document.getElementById("btn-cancel-edit").classList.add("hidden");
}

async function toggleTask(t) {
    const nuevoStatus = (t.status === "DONE") ? "IN_PROGRESS" : "DONE";
    const cat = allCategories.find(c => c.title === t.category);
    const cmd = {
        title:       t.title,
        description: t.description,
        completed:   nuevoStatus === "DONE",
        deadline:    t.deadline ? t.deadline.slice(0, 19) : null,
        priority:    t.priority,
        status:      nuevoStatus,
        categoryId:  cat ? cat.id : null
    };
    const res = await apiFetch("/task/" + t.id, "PUT", cmd);
    if (res.ok) { await cargarDashboard(); await cargarTareas(); }
    else { toast("No autorizado para editar esta tarea", "error"); }
}

async function deleteTask(id) {
    if (!confirm("¿Eliminar esta tarea permanentemente?")) return;
    const res = await apiFetch("/task/" + id, "DELETE");
    if (res.ok || res.status === 204) {
        toast("Tarea eliminada", "success");
        await cargarDashboard();
        await cargarTareas();
    } else { toast("No autorizado para eliminar esta tarea", "error"); }
}

//  EDITAR
function openModal(t) {
    editingTaskId = t.id;
    document.getElementById("modal-titulo").value       = t.title || "";
    document.getElementById("modal-descripcion").value  = t.description || "";
    document.getElementById("modal-prioridad").value    = t.priority || "MEDIUM";
    document.getElementById("modal-status").value       = t.status   || "PENDING";
    document.getElementById("modal-deadline").value     = t.deadline ? t.deadline.slice(0, 16) : "";

    rellenarSelectCategorias();
    const modalCat = document.getElementById("modal-categoria");
    const cat = allCategories.find(c => c.title === t.category);
    modalCat.value = cat ? cat.id : "";

    document.getElementById("modal-overlay").classList.remove("hidden");
}

function closeModal() {
    editingTaskId = null;
    document.getElementById("modal-overlay").classList.add("hidden");
}

async function handleModalSave() {
    if (!editingTaskId) return;
    const rawDeadline = document.getElementById("modal-deadline").value;
    const catId = document.getElementById("modal-categoria").value;

    const cmd = {
        title:       document.getElementById("modal-titulo").value.trim(),
        description: document.getElementById("modal-descripcion").value.trim() || null, 
        completed:   document.getElementById("modal-status").value === "DONE",
        deadline:    rawDeadline ? (rawDeadline.length === 16 ? rawDeadline + ":00" : rawDeadline.slice(0, 19)) : null,
        priority:    document.getElementById("modal-prioridad").value,
        status:      document.getElementById("modal-status").value,
        categoryId:  catId ? parseInt(catId) : null
    };

    if (!cmd.title) { toast("El título no puede estar vacío", "error"); return; }

    const res = await apiFetch("/task/" + editingTaskId, "PUT", cmd);
    if (res.ok) {
        toast("Tarea actualizada", "success");
        closeModal();
        await cargarDashboard();
        await cargarTareas();
    } else { toast("No autorizado o error al editar esta tarea", "error"); }
}

//  BUSCADOR
function ajustarBuscador() {
    const tipo = document.getElementById("search-type").value;
    const label = document.getElementById("search-label");

    ["search-text","search-date","search-completed-sel",
     "search-priority-sel","search-status-sel",
     "search-category-sel","search-tagids"].forEach(id =>
        document.getElementById(id).classList.add("hidden")
    );
    document.getElementById("search-param-wrap").style.display = "flex";

    const maps = {
        title:         ["search-text",          "Texto en título"],
        description:   ["search-text",          "Texto en descripción"],
        byTag:         ["search-text",          "Nombre del tag"],
        byTags:        ["search-tagids",        "IDs de tags (ej: 1,2,3)"],
        completed:     ["search-completed-sel", "Estado"],
        priority:      ["search-priority-sel",  "Prioridad"],
        status:        ["search-status-sel",    "Estado de progreso"],
        category:      ["search-category-sel",  "Categoría"],
        deadlineBefore:["search-date",          "Deadline antes de"],
        deadlineAfter: ["search-date",          "Deadline después de"],
    };

    if (maps[tipo]) {
        document.getElementById(maps[tipo][0]).classList.remove("hidden");
        label.textContent = maps[tipo][1];
    } else {
        document.getElementById("search-param-wrap").style.display = "none";
    }
}

async function ejecutarBusqueda() {
    const tipo = document.getElementById("search-type").value;
    let url = "/task";

    if (tipo === "all") {
        url = "/task";
    } else if (tipo === "overdue") {
        url = "/task/search/overdue";
    } else if (tipo === "byTag") {
        const v = document.getElementById("search-text").value.trim();
        if (!v) { toast("Escribe un nombre de tag", "error"); return; }
        url = "/task/by-tag?tag=" + encodeURIComponent(v);
    } else if (tipo === "byTags") {
        const raw = document.getElementById("search-tagids").value.trim();
        if (!raw) { toast("Introduce al menos un ID", "error"); return; }
        url = "/task/search/by-tags?tagIds=" + encodeURIComponent(raw);
    } else if (tipo === "title") {
        const v = document.getElementById("search-text").value.trim();
        url = "/task/search?title=" + encodeURIComponent(v);
    } else if (tipo === "description") {
        const v = document.getElementById("search-text").value.trim();
        url = "/task/search?description=" + encodeURIComponent(v);
    } else if (tipo === "completed") {
        url = "/task/search?completed=" + document.getElementById("search-completed-sel").value;
    } else if (tipo === "priority") {
        url = "/task/search?priority=" + document.getElementById("search-priority-sel").value;
    } else if (tipo === "status") {
        url = "/task/search?status=" + document.getElementById("search-status-sel").value;
    } else if (tipo === "category") {
        const v = document.getElementById("search-category-sel").value;
        if (!v) { toast("Selecciona una categoría", "error"); return; }
        url = "/task/search?category=" + v;
    } else if (tipo === "deadlineBefore") {
        const v = document.getElementById("search-date").value;
        if (!v) { toast("Selecciona una fecha", "error"); return; }
        url = "/task/search?deadlineBefore=" + encodeURIComponent(v.replace("T","T") + ":00");
    } else if (tipo === "deadlineAfter") {
        const v = document.getElementById("search-date").value;
        if (!v) { toast("Selecciona una fecha", "error"); return; }
        url = "/task/search?deadlineAfter=" + encodeURIComponent(v.replace("T","T") + ":00");
    }

    try {
        const res = await apiFetch(url);
        if (!res.ok) { toast("Error en la búsqueda", "error"); return; }
        const tareas = await res.json();
        renderTareas(tareas);
        toast("Búsqueda completada — " + tareas.length + " resultado(s)", "success");
    } catch { toast("Error de red", "error"); }
}

function limpiarFiltros() {
    document.getElementById("search-type").value = "all";
    ajustarBuscador();
    cargarTareas();
}

//  auxiliar
function apiFetch(path, method = "GET", body = null) {
    const opts = { method, headers: { Authorization: auth } };
    if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    return fetch(API + path, opts);
}

function set(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function badge(cls, text) {
    const span = document.createElement("span");
    span.className = "badge " + cls;
    span.textContent = text;
    return span;
}

function labelPriority(p) {
    return { LOW: "🟢 Baja", MEDIUM: "🟡 Media", HIGH: "🟠 Alta", CRITICAL: "🔴 Crítica" }[p] || p;
}

function labelStatus(s) {
    return {
        PENDING:        "Pendiente",
        IN_PROGRESS:    "En progreso",
        PARTIALLY_DONE: "Parcial",
        DONE:           "Hecha"
    }[s] || s;
}

function formatDeadline(dt) {
    if (!dt) return "";
    const d = new Date(dt);
    return d.toLocaleDateString("es-ES", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" });
}

function isOverdue(t) {
    if (!t.deadline || t.completed || t.status === "DONE") return false;
    return new Date(t.deadline) < new Date();
}

function actualizarRolBadge() {
    const badge = document.getElementById("user-role-badge");
    if (!badge || !currentUser) return;
    badge.textContent = currentUser.role;
    badge.className = "role-badge " + currentUser.role;
    if (currentUser.role === "ADMIN" || currentUser.role === "GESTOR") {
        document.getElementById("admin-cat-form").classList.remove("hidden");
    }
}