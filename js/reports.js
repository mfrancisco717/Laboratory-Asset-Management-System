
/* =========================================================
   LABORATORY ASSET MANAGEMENT SYSTEM
   reports.js
   Reports & Analytics
   ========================================================= */

let reportUser = null;
let equipmentData = [];
let borrowingData = [];
let maintenanceData = [];
let requesterProfiles = [];

/* =========================================================
   INITIALIZATION
   ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
    document
        .getElementById("refreshReportsBtn")
        ?.addEventListener("click", loadReports);

    document
        .getElementById("printReportsBtn")
        ?.addEventListener("click", () => window.print());

    document
        .getElementById("exportEquipmentBtn")
        ?.addEventListener("click", exportEquipmentCSV);

    document
        .getElementById("exportBorrowingBtn")
        ?.addEventListener("click", exportBorrowingCSV);

    document
        .getElementById("exportMaintenanceBtn")
        ?.addEventListener("click", exportMaintenanceCSV);

    document
        .getElementById("equipmentSearch")
        ?.addEventListener("input", renderEquipmentReport);

    document
        .getElementById("equipmentStatusFilter")
        ?.addEventListener("change", renderEquipmentReport);

    document
        .getElementById("borrowingSearch")
        ?.addEventListener("input", renderBorrowingReport);

    document
        .getElementById("borrowingStatusFilter")
        ?.addEventListener("change", renderBorrowingReport);

    document
        .getElementById("maintenanceSearch")
        ?.addEventListener("input", renderMaintenanceReport);

    document
        .getElementById("maintenanceStatusFilter")
        ?.addEventListener("change", renderMaintenanceReport);

    await checkAdminAccess();
});

/* =========================================================
   AUTHENTICATION AND ADMIN ACCESS
   ========================================================= */

async function checkAdminAccess() {
    try {
        const {
            data: { user },
            error: authError
        } = await supabaseClient.auth.getUser();

        if (authError || !user) {
            window.location.href = "login.html";
            return;
        }

        reportUser = user;

        const { data: profile, error: profileError } =
            await supabaseClient
                .from("profiles")
                .select("id, full_name, email, role")
                .eq("id", user.id)
                .maybeSingle();

        if (profileError) {
            console.error("Profile verification failed:", profileError);
            showMessage(
                "Unable to verify your account. Please check your connection and try again.",
                true
            );
            return;
        }

        if (!profile || profile.role !== "Administrator") {
            alert("Access denied. Only Administrators can view reports.");
            window.location.href = "dashboard.html";
            return;
        }

        await loadReports();

    } catch (error) {
        console.error("Access check failed:", error);
        showMessage("An error occurred while verifying access.", true);
    }
}

/* =========================================================
   LOAD REPORTS
   ========================================================= */

async function loadReports() {
    try {
        showMessage("Loading reports...", false);

        const [
            equipmentResult,
            borrowingResult,
            maintenanceResult
        ] = await Promise.all([
            supabaseClient
                .from("equipment")
                .select("*")
                .order("created_at", { ascending: false }),

            supabaseClient
                .from("borrowing_requests")
                .select("*")
                .order("created_at", { ascending: false }),

            supabaseClient
                .from("maintenance_requests")
                .select("*")
                .order("created_at", { ascending: false })
        ]);

        if (equipmentResult.error) {
            throw new Error(
                "Equipment: " + equipmentResult.error.message
            );
        }

        if (borrowingResult.error) {
            throw new Error(
                "Borrowing requests: " + borrowingResult.error.message
            );
        }

        if (maintenanceResult.error) {
            throw new Error(
                "Maintenance requests: " + maintenanceResult.error.message
            );
        }

        equipmentData = equipmentResult.data || [];
        borrowingData = borrowingResult.data || [];
        maintenanceData = maintenanceResult.data || [];

        await loadRequesterProfiles();
        attachRequesterProfiles();

        updateSummaryCards();
        renderEquipmentReport();
        renderBorrowingReport();
        renderMaintenanceReport();

        showMessage("Reports refreshed successfully.", false);

    } catch (error) {
        console.error("Unable to load reports:", error);
        showMessage(error.message || "Unable to load reports.", true);
    }
}

/* =========================================================
   LOAD REQUESTER NAMES
   ========================================================= */

async function loadRequesterProfiles() {
    requesterProfiles = [];

    const requesterIds = [
        ...new Set([
            ...borrowingData.map(request => request.requester_id),
            ...maintenanceData.map(request => request.requester_id)
        ].filter(Boolean))
    ];

    if (requesterIds.length === 0) {
        return;
    }

    const batchSize = 100;

    for (let i = 0; i < requesterIds.length; i += batchSize) {
        const batch = requesterIds.slice(i, i + batchSize);

        const { data, error } = await supabaseClient
            .from("profiles")
            .select("id, full_name, email")
            .in("id", batch);

        if (error) {
            console.error(
                "Unable to retrieve requester profiles. Check profiles SELECT permissions:",
                error
            );

            showMessage(
                "Reports loaded, but requester names could not be retrieved. Check the profiles table permissions in Supabase.",
                true
            );

            continue;
        }

        requesterProfiles.push(...(data || []));
    }
}

function attachRequesterProfiles() {
    const profilesById = new Map(
        requesterProfiles.map(profile => [profile.id, profile])
    );

    borrowingData = borrowingData.map(request => ({
        ...request,
        requester_profile:
            profilesById.get(request.requester_id) || null
    }));

    maintenanceData = maintenanceData.map(request => ({
        ...request,
        requester_profile:
            profilesById.get(request.requester_id) || null
    }));
}

/* =========================================================
   SUMMARY CARDS
   ========================================================= */

function updateSummaryCards() {
    setText("totalEquipment", equipmentData.length);

    /*
     * These counts are equipment records, not a sum of
     * individual unit quantities.
     */
    setText(
        "availableEquipment",
        equipmentData
            .filter(item => item.status === "Available")
            .reduce((total, item) => total + getQuantity(item), 0)
    );

    setText(
        "borrowedEquipment",
        equipmentData
            .filter(item => item.status === "Borrowed")
            .reduce((total, item) => total + getQuantity(item), 0)
    );

    setText(
        "pendingRequests",
        borrowingData.filter(request => request.status === "Pending").length
    );
}

/* =========================================================
   EQUIPMENT REPORT
   ========================================================= */

function renderEquipmentReport() {
    const tbody = document.getElementById("equipmentReportTable");

    if (!tbody) return;

    const search = getValue("equipmentSearch").toLowerCase();
    const selectedStatus = getValue("equipmentStatusFilter");

    const filtered = equipmentData.filter(item => {
        const searchableText = [
            getEquipmentCode(item),
            getEquipmentName(item),
            item.category,
            getLaboratory(item),
            item.location,
            item.status
        ].filter(Boolean).join(" ").toLowerCase();

        return searchableText.includes(search) &&
            (!selectedStatus || item.status === selectedStatus);
    });

    if (filtered.length === 0) {
        tbody.innerHTML = emptyRow(6, "No equipment records found.");
        setText("equipmentCount", "0 records");
        return;
    }

    tbody.innerHTML = filtered.map(item => `
        <tr>
            <td>${escapeHTML(getEquipmentCode(item))}</td>
            <td>${escapeHTML(getEquipmentName(item))}</td>
            <td>${escapeHTML(item.category || "—")}</td>
            <td>${escapeHTML(getLaboratory(item))}</td>
            <td>${escapeHTML(getQuantity(item))}</td>
            <td>${statusBadge(item.status)}</td>
        </tr>
    `).join("");

    setText(
        "equipmentCount",
        `Showing ${filtered.length} of ${equipmentData.length} records`
    );
}

/* =========================================================
   BORROWING REPORT
   ========================================================= */

function renderBorrowingReport() {
    const tbody = document.getElementById("borrowingReportTable");

    if (!tbody) return;

    const search = getValue("borrowingSearch").toLowerCase();
    const selectedStatus = getValue("borrowingStatusFilter");

    const filtered = borrowingData.filter(request => {
        const profile = request.requester_profile;

        const requesterName =
            profile?.full_name ||
            profile?.email ||
            "Unavailable";

        const searchableText = [
            request.id,
            requesterName,
            profile?.email,
            getBorrowingEquipmentName(request),
            request.purpose,
            request.status
        ].filter(Boolean).join(" ").toLowerCase();

        return searchableText.includes(search) &&
            (!selectedStatus || request.status === selectedStatus);
    });

    if (filtered.length === 0) {
        tbody.innerHTML = emptyRow(8, "No borrowing records found.");
        setText("borrowingCount", "0 records");
        return;
    }

    tbody.innerHTML = filtered.map(request => {
        const profile = request.requester_profile;

        const requesterName =
            profile?.full_name ||
            profile?.email ||
            "Unavailable";

        return `
            <tr>
                <td>${escapeHTML(request.id)}</td>
                <td>${escapeHTML(requesterName)}</td>
                <td>${escapeHTML(getBorrowingEquipmentName(request))}</td>
                <td>${escapeHTML(request.quantity ?? "—")}</td>
                <td>${escapeHTML(request.purpose || "—")}</td>
                <td>${escapeHTML(formatDate(request.created_at))}</td>
                <td>${escapeHTML(formatDate(getExpectedReturn(request)))}</td>
                <td>${statusBadge(request.status)}</td>
            </tr>
        `;
    }).join("");

    setText(
        "borrowingCount",
        `Showing ${filtered.length} of ${borrowingData.length} records`
    );
}

/* =========================================================
   MAINTENANCE REPORT
   ========================================================= */

function renderMaintenanceReport() {
    const tbody = document.getElementById("maintenanceReportTable");

    if (!tbody) return;

    const search = getValue("maintenanceSearch").toLowerCase();
    const selectedStatus = getValue("maintenanceStatusFilter");

    const filtered = maintenanceData.filter(request => {
        const profile = request.requester_profile;

        const requesterName =
            profile?.full_name ||
            profile?.email ||
            "Unavailable";

        const searchableText = [
            request.id,
            getMaintenanceEquipmentName(request),
            request.description,
            request.problem,
            requesterName,
            profile?.email,
            request.status
        ].filter(Boolean).join(" ").toLowerCase();

        return searchableText.includes(search) &&
            (!selectedStatus || request.status === selectedStatus);
    });

    if (filtered.length === 0) {
        tbody.innerHTML = emptyRow(6, "No maintenance records found.");
        setText("maintenanceCount", "0 records");
        return;
    }

    tbody.innerHTML = filtered.map(request => {
        const profile = request.requester_profile;

        const requesterName =
            profile?.full_name ||
            profile?.email ||
            "Unavailable";

        return `
            <tr>
                <td>${escapeHTML(request.id)}</td>
                <td>${escapeHTML(getMaintenanceEquipmentName(request))}</td>
                <td>${escapeHTML(
                    request.description ||
                    request.problem ||
                    "—"
                )}</td>
                <td>${escapeHTML(requesterName)}</td>
                <td>${escapeHTML(formatDate(request.created_at))}</td>
                <td>${statusBadge(request.status)}</td>
            </tr>
        `;
    }).join("");

    setText(
        "maintenanceCount",
        `Showing ${filtered.length} of ${maintenanceData.length} records`
    );
}

/* =========================================================
   CSV EXPORTS
   Exports the currently filtered rows in each report.
   ========================================================= */

function exportEquipmentCSV() {
    const search = getValue("equipmentSearch").toLowerCase();
    const status = getValue("equipmentStatusFilter");

    const filtered = equipmentData.filter(item => {
        const searchableText = [
            getEquipmentCode(item),
            getEquipmentName(item),
            item.category,
            getLaboratory(item),
            item.location,
            item.status
        ].filter(Boolean).join(" ").toLowerCase();

        return searchableText.includes(search) &&
            (!status || item.status === status);
    });

    const rows = filtered.map(item => ({
        "Equipment Code": getEquipmentCode(item),
        "Equipment Name": getEquipmentName(item),
        Category: item.category || "",
        Laboratory: getLaboratory(item),
        Quantity: getQuantity(item),
        Status: item.status || ""
    }));

    downloadCSV("equipment_report.csv", rows);
}

function exportBorrowingCSV() {
    const search = getValue("borrowingSearch").toLowerCase();
    const status = getValue("borrowingStatusFilter");

    const filtered = borrowingData.filter(request => {
        const profile = request.requester_profile;

        const requesterName =
            profile?.full_name ||
            profile?.email ||
            "Unavailable";

        const searchableText = [
            request.id,
            requesterName,
            profile?.email,
            getBorrowingEquipmentName(request),
            request.purpose,
            request.status
        ].filter(Boolean).join(" ").toLowerCase();

        return searchableText.includes(search) &&
            (!status || request.status === status);
    });

    const rows = filtered.map(request => ({
        "Request ID": request.id,
        Requester:
            request.requester_profile?.full_name ||
            request.requester_profile?.email ||
            "Unavailable",
        Email: request.requester_profile?.email || "",
        Equipment: getBorrowingEquipmentName(request),
        Quantity: request.quantity ?? "",
        Purpose: request.purpose || "",
        "Request Date": formatDate(request.created_at),
        "Expected Return": formatDate(getExpectedReturn(request)),
        Status: request.status || ""
    }));

    downloadCSV("borrowing_report.csv", rows);
}

function exportMaintenanceCSV() {
    const search = getValue("maintenanceSearch").toLowerCase();
    const status = getValue("maintenanceStatusFilter");

    const filtered = maintenanceData.filter(request => {
        const profile = request.requester_profile;

        const requesterName =
            profile?.full_name ||
            profile?.email ||
            "Unavailable";

        const searchableText = [
            request.id,
            getMaintenanceEquipmentName(request),
            request.description,
            request.problem,
            requesterName,
            profile?.email,
            request.status
        ].filter(Boolean).join(" ").toLowerCase();

        return searchableText.includes(search) &&
            (!status || request.status === status);
    });

    const rows = filtered.map(request => ({
        "Request ID": request.id,
        Equipment: getMaintenanceEquipmentName(request),
        Problem: request.description || request.problem || "",
        "Requested By":
            request.requester_profile?.full_name ||
            request.requester_profile?.email ||
            "Unavailable",
        Email: request.requester_profile?.email || "",
        "Date Reported": formatDate(request.created_at),
        Status: request.status || ""
    }));

    downloadCSV("maintenance_report.csv", rows);
}

function downloadCSV(filename, rows) {
    if (rows.length === 0) {
        alert("No records are available to export.");
        return;
    }

    const headers = Object.keys(rows[0]);

    const csv = [
        headers.map(csvEscape).join(","),
        ...rows.map(row =>
            headers.map(header => csvEscape(row[header])).join(",")
        )
    ].join("\r\n");

    const blob = new Blob(["\uFEFF" + csv], {
        type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
}

function csvEscape(value) {
    let text = String(value ?? "");

    // Prevent spreadsheet formulas from being evaluated.
    if (/^[\s]*[=+\-@]/.test(text)) {
        text = "'" + text;
    }

    return `"${text.replace(/"/g, '""')}"`;
}

/* =========================================================
   FIELD HELPERS
   These support common alternative column names.
   ========================================================= */

function getEquipmentCode(item) {
    return item.equipment_code ??
        item.asset_code ??
        item.item_code ??
        item.code ??
        item.id ??
        "—";
}

function getEquipmentName(item) {
    return item.equipment_name ??
        item.name ??
        item.item_name ??
        "—";
}

function getLaboratory(item) {
    return item.laboratory ??
        item.laboratory_name ??
        item.location ??
        item.room ??
        "—";
}

function getQuantity(item) {
    const quantity = Number(item.quantity);
    return Number.isFinite(quantity) && quantity >= 0 ? quantity : 0;
}

function getBorrowingEquipmentName(request) {
    return request.equipment_name ||
        request.equipment?.equipment_name ||
        request.equipment?.name ||
        request.equipment?.item_name ||
        (request.equipment_id
            ? `Equipment #${request.equipment_id}`
            : "—");
}

function getMaintenanceEquipmentName(request) {
    return request.equipment_name ||
        request.equipment?.equipment_name ||
        request.equipment?.name ||
        request.equipment?.item_name ||
        (request.equipment_id
            ? `Equipment #${request.equipment_id}`
            : "—");
}

function getExpectedReturn(request) {
    return request.expected_return_date ??
        request.expected_return ??
        request.return_date ??
        request.due_date ??
        null;
}

/* =========================================================
   DISPLAY HELPERS
   ========================================================= */

function statusBadge(status) {
    const value = String(status || "Unknown");

    const cssClass = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

    return `
        <span class="status-badge status-${escapeHTML(cssClass)}">
            ${escapeHTML(value)}
        </span>
    `;
}

function getValue(id) {
    return document.getElementById(id)?.value?.trim() || "";
}

function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
        element.textContent = value ?? 0;
    }
}

function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[character];
    });
}

function emptyRow(columnCount, message) {
    return `
        <tr>
            <td colspan="${columnCount}" style="text-align:center;">
                ${escapeHTML(message)}
            </td>
        </tr>
    `;
}

function showMessage(message, isError = false) {
    const element = document.getElementById("reportMessage");

    if (!element) {
        console[isError ? "error" : "log"](message);
        return;
    }

    element.textContent = message;
    element.classList.toggle("error", isError);
    element.classList.toggle("success", !isError);
}
