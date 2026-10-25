
let maintenanceUser = null;
let maintenanceProfile = null;

let maintenanceEquipmentRecords = [];
let maintenanceRecords = [];
let maintenanceLoading = false;

const maintenanceMessage =
    document.getElementById("maintenanceMessage");

function showMaintenanceMessage(message, type = "info") {
    if (!maintenanceMessage) return;

    maintenanceMessage.textContent = message;
    maintenanceMessage.className =
        `maintenance-message visible ${type}`;
}

function escapeStatusClass(status) {
    return String(status || "Pending")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

function formatMaintenanceDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleDateString();
}

function addMaintenanceCell(row, value) {
    const cell = document.createElement("td");

    cell.textContent =
        value === null || value === undefined || value === ""
            ? "—"
            : String(value);

    row.appendChild(cell);
    return cell;
}

function setMaintenanceTableMessage(message) {
    const table = document.getElementById("maintenanceTable");

    if (!table) return;

    table.replaceChildren();

    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 7;
    cell.textContent = message;

    row.appendChild(cell);
    table.appendChild(row);
}

function isAdministrator() {
    return maintenanceProfile?.role === "Administrator";
}

function isLaboratoryStaff() {
    return maintenanceProfile?.role === "Laboratory Staff";
}

function canManageMaintenance() {
    return isAdministrator() || isLaboratoryStaff();
}

function getMaintenanceRequesterName(record) {
    const profile = record.requester_profile;

    if (!profile) {
        return "Profile unavailable";
    }

    return profile.full_name || profile.email || "Name not set";
}

function getMaintenanceEquipmentName(record) {
    const equipment = record.equipment || {};

    const name = [
        equipment.equipment_code,
        equipment.equipment_name
    ].filter(Boolean).join(" - ");

    return name || "Equipment unavailable";
}

async function initializeMaintenance() {
    try {
        const {
            data: { user },
            error: userError
        } = await supabaseClient.auth.getUser();

        if (userError || !user) {
            window.location.href = "login.html";
            return;
        }

        maintenanceUser = user;

        const { data: profile, error: profileError } =
            await supabaseClient
                .from("profiles")
                .select("id, full_name, email, role")
                .eq("id", user.id)
                .single();

        if (profileError || !profile) {
            console.error(
                "Maintenance profile error:",
                profileError
            );

            showMaintenanceMessage(
                "Unable to load your profile. Check your profiles table and permissions.",
                "error"
            );

            document.getElementById("maintenanceUserName")
                .textContent = "Profile unavailable";

            document.getElementById("maintenanceUserRole")
                .textContent = "Unknown";

            document.getElementById("maintenanceFormCard")
                .hidden = true;

            setMaintenanceTableMessage(
                "Unable to initialize the maintenance page."
            );

            return;
        }

        maintenanceProfile = profile;

        document.getElementById("maintenanceUserName")
            .textContent =
                profile.full_name || profile.email || "User";

        document.getElementById("maintenanceUserRole")
            .textContent = profile.role || "Unknown";

        document.getElementById("maintenanceFormCard")
            .hidden = false;

        document.getElementById("maintenanceActionHeading")
            .textContent = canManageMaintenance()
                ? "Manage Status"
                : "Status";

        await loadMaintenanceEquipment();
        await loadMaintenanceRecords();

    } catch (error) {
        console.error("Maintenance initialization error:", error);

        showMaintenanceMessage(
            "Unable to initialize the maintenance page: " +
            error.message,
            "error"
        );
    }
}

async function loadMaintenanceEquipment() {
    const select =
        document.getElementById("maintenanceEquipment");

    if (!select) return;

    select.replaceChildren();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Loading equipment...";
    select.appendChild(placeholder);

    const { data, error } = await supabaseClient
        .from("equipment")
        .select(`
            id,
            equipment_code,
            equipment_name,
            status
        `)
        .order("equipment_code");

    if (error) {
        console.error("Equipment loading error:", error);

        select.replaceChildren();

        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Unable to load equipment";

        select.appendChild(option);

        showMaintenanceMessage(
            "Unable to load equipment: " + error.message,
            "error"
        );

        return;
    }

    maintenanceEquipmentRecords = data || [];

    select.replaceChildren();

    const firstOption = document.createElement("option");
    firstOption.value = "";
    firstOption.textContent = "Select Equipment";

    select.appendChild(firstOption);

    if (maintenanceEquipmentRecords.length === 0) {
        firstOption.textContent = "No equipment records found";
        return;
    }

    maintenanceEquipmentRecords.forEach(item => {
        const option = document.createElement("option");

        option.value = item.id;

        option.textContent =
            `${item.equipment_code || ""} - ${item.equipment_name || "Unnamed equipment"}` +
            ` (${item.status || "Unknown"})`;

        select.appendChild(option);
    });
}

async function loadMaintenanceRecords() {
    if (maintenanceLoading) return;

    maintenanceLoading = true;

    setMaintenanceTableMessage(
        "Loading maintenance records..."
    );

    try {
        let query = supabaseClient
            .from("maintenance_requests")
            .select(`
                id,
                equipment_id,
                requester_id,
                problem_description,
                status,
                remarks,
                created_at,
                equipment (
                    equipment_code,
                    equipment_name,
                    status
                )
            `)
            .order("id", { ascending: false });

        if (!canManageMaintenance()) {
            query = query.eq(
                "requester_id",
                maintenanceUser.id
            );
        }

        const { data, error } = await query;

        if (error) {
            console.error(
                "Maintenance records error:",
                error
            );

            setMaintenanceTableMessage(
                "Unable to load maintenance records."
            );

            showMaintenanceMessage(
                "Unable to load maintenance records: " +
                error.message,
                "error"
            );

            return;
        }

        maintenanceRecords = data || [];

        // Load requester profiles through the existing RPC.
        const requesterIds = [
            ...new Set(
                maintenanceRecords
                    .map(record => record.requester_id)
                    .filter(Boolean)
            )
        ];

        let profilesById = new Map();

        if (requesterIds.length > 0) {
            const { data: profiles, error: profilesError } =
                await supabaseClient.rpc(
                    "get_maintenance_requester_profiles",
                    {
                        requester_ids: requesterIds
                    }
                );

            if (profilesError) {
                console.error(
                    "Requester profiles error:",
                    profilesError
                );
            } else {
                profilesById = new Map(
                    (profiles || []).map(profile => [
                        String(profile.id),
                        profile
                    ])
                );
            }
        }

        maintenanceRecords = maintenanceRecords.map(record => ({
            ...record,
            requester_profile:
                profilesById.get(String(record.requester_id)) || null
        }));

        renderMaintenanceRecords();

    } catch (error) {
        console.error(
            "Unexpected maintenance error:",
            error
        );

        showMaintenanceMessage(
            "Unable to load maintenance records: " +
            error.message,
            "error"
        );

        setMaintenanceTableMessage(
            "An unexpected error occurred while loading records."
        );

    } finally {
        maintenanceLoading = false;
    }
}

function renderMaintenanceRecords() {
    const table =
        document.getElementById("maintenanceTable");

    if (!table) return;

    const search =
        document.getElementById("maintenanceSearch")
            .value.trim().toLowerCase();

    const status =
        document.getElementById("maintenanceStatusFilter")
            .value;

    const filtered = maintenanceRecords.filter(record => {
        const searchable = [
            record.id,
            record.problem_description,
            record.status,
            record.requester_id,
            getMaintenanceRequesterName(record),
            getMaintenanceEquipmentName(record)
        ].join(" ").toLowerCase();

        return searchable.includes(search) &&
            (!status || record.status === status);
    });

    table.replaceChildren();

    if (filtered.length === 0) {
        setMaintenanceTableMessage(
            maintenanceRecords.length === 0
                ? "No maintenance requests have been submitted yet."
                : "No matching maintenance requests found."
        );
    } else {
        filtered.forEach(record => {
            const row = document.createElement("tr");

            addMaintenanceCell(row, record.id);
            addMaintenanceCell(
                row,
                getMaintenanceEquipmentName(record)
            );
            addMaintenanceCell(
                row,
                record.problem_description
            );
            addMaintenanceCell(
                row,
                getMaintenanceRequesterName(record)
            );
            addMaintenanceCell(
                row,
                formatMaintenanceDate(record.created_at)
            );

            const statusCell = document.createElement("td");
            const badge = document.createElement("span");

            badge.className =
                "maintenance-status " +
                escapeStatusClass(record.status);

            badge.textContent = record.status || "Pending";

            statusCell.appendChild(badge);
            row.appendChild(statusCell);

            const actionCell = document.createElement("td");

            if (canManageMaintenance()) {
                const actionBox = document.createElement("div");
                actionBox.className = "maintenance-action";

                const statusSelect = document.createElement("select");

                statusSelect.setAttribute(
                    "aria-label",
                    `Update status for maintenance request ${record.id}`
                );

                [
                    "Pending",
                    "In Progress",
                    "Completed",
                    "Cancelled"
                ].forEach(statusOption => {
                    const option = document.createElement("option");

                    option.value = statusOption;
                    option.textContent = statusOption;
                    option.selected = statusOption === record.status;

                    statusSelect.appendChild(option);
                });

                const saveButton = document.createElement("button");

                saveButton.type = "button";
                saveButton.className = "maintenance-button";
                saveButton.textContent = "Save Status";

                saveButton.addEventListener("click", async () => {
                    const newStatus = statusSelect.value;

                    if (newStatus === record.status) {
                        showMaintenanceMessage(
                            "No status changes were made.",
                            "info"
                        );
                        return;
                    }

                    await updateMaintenanceStatus(
                        record.id,
                        record.status,
                        newStatus,
                        saveButton
                    );
                });

                actionBox.append(statusSelect, saveButton);
                actionCell.appendChild(actionBox);
            } else {
                actionCell.textContent = "View only";
            }

            row.appendChild(actionCell);
            table.appendChild(row);
        });
    }

    document.getElementById("maintenanceCount")
        .textContent =
            `${filtered.length} of ${maintenanceRecords.length} maintenance records`;
}

async function updateMaintenanceStatus(
    requestId,
    currentStatus,
    newStatus,
    button
) {
    if (!canManageMaintenance()) {
        showMaintenanceMessage(
            "You do not have permission to update maintenance status.",
            "error"
        );
        return;
    }

    const allowedStatuses = [
        "Pending",
        "In Progress",
        "Completed",
        "Cancelled"
    ];

    if (!allowedStatuses.includes(newStatus)) {
        showMaintenanceMessage(
            "Invalid maintenance status.",
            "error"
        );
        return;
    }

    if (newStatus === currentStatus) {
        showMaintenanceMessage(
            "No status changes were made.",
            "info"
        );
        return;
    }

    const confirmed = window.confirm(
        `Change maintenance request #${requestId} ` +
        `from "${currentStatus}" to "${newStatus}"?`
    );

    if (!confirmed) return;

    button.disabled = true;
    button.textContent = "Saving...";

    try {
        /*
         * Update by request ID only.
         * The current-status filter is intentionally removed so
         * a stale status in the page does not block the update.
         * The database UPDATE policy still controls permission.
         */
        const { data, error } = await supabaseClient
            .from("maintenance_requests")
            .update({
                status: newStatus
            })
            .eq("id", requestId)
            .select("id, status")
            .maybeSingle();

        if (error) {
            console.error(
                "Maintenance status update error:",
                error
            );

            showMaintenanceMessage(
                "Unable to update status: " + error.message,
                "error"
            );

            return;
        }

        if (!data) {
            console.error(
                "No maintenance row was returned after update.",
                {
                    requestId,
                    currentStatus,
                    newStatus
                }
            );

            showMaintenanceMessage(
                "No record was updated. Check the maintenance_requests UPDATE policy and confirm that this request is visible to your account.",
                "error"
            );

            await loadMaintenanceRecords();
            return;
        }

        // Record the status change in the audit log.
        const { error: auditError } =
            await supabaseClient
                .from("audit_logs")
                .insert({
                    user_id: maintenanceUser.id,
                    action: "MAINTENANCE_STATUS_UPDATED",
                    module: "Maintenance",
                    record_id: requestId,
                    description:
                        `Maintenance request status changed from ${currentStatus} to ${data.status}.`
                });

        if (auditError) {
            console.error(
                "Maintenance audit log error:",
                auditError
            );

            showMaintenanceMessage(
                `Status updated to ${data.status}, but the audit log could not be saved: ${auditError.message}`,
                "error"
            );
        } else {
            showMaintenanceMessage(
                `Maintenance request #${requestId} updated to ${data.status}.`,
                "success"
            );
        }

        await loadMaintenanceRecords();

    } catch (error) {
        console.error(
            "Unexpected status update error:",
            error
        );

        showMaintenanceMessage(
            "Unexpected error while updating status: " +
            error.message,
            "error"
        );

    } finally {
        button.disabled = false;
        button.textContent = "Save Status";
    }
}

document
    .getElementById("maintenanceForm")
    .addEventListener("submit", async function(event) {
        event.preventDefault();

        if (!maintenanceUser || !maintenanceProfile) {
            showMaintenanceMessage(
                "Your account has not been verified. Please sign in again.",
                "error"
            );
            return;
        }

        const equipmentId =
            document.getElementById("maintenanceEquipment").value;

        const problem =
            document.getElementById("problemDescription")
                .value.trim();

        const submitButton =
            document.getElementById("submitMaintenanceBtn");

        if (!equipmentId || !problem) {
            showMaintenanceMessage(
                "Please select equipment and describe the problem.",
                "error"
            );
            return;
        }

        if (problem.length > 2000) {
            showMaintenanceMessage(
                "The problem description must not exceed 2,000 characters.",
                "error"
            );
            return;
        }

        const selectedEquipment =
            maintenanceEquipmentRecords.find(
                item => String(item.id) === String(equipmentId)
            );

        if (!selectedEquipment) {
            showMaintenanceMessage(
                "Please select valid equipment from the list.",
                "error"
            );
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = "Submitting...";

        try {
            const { data, error } = await supabaseClient
                .from("maintenance_requests")
                .insert({
                    equipment_id: equipmentId,
                    requester_id: maintenanceUser.id,
                    problem_description: problem,
                    status: "Pending"
                })
                .select("id")
                .single();

            if (error) {
                console.error(
                    "Maintenance submission error:",
                    error
                );

                showMaintenanceMessage(
                    "Unable to submit the maintenance request: " +
                    error.message,
                    "error"
                );

                return;
            }

            const { error: auditError } =
                await supabaseClient
                    .from("audit_logs")
                    .insert({
                        user_id: maintenanceUser.id,
                        action: "MAINTENANCE_REQUEST_CREATED",
                        module: "Maintenance",
                        record_id: data.id,
                        description:
                            `Submitted a maintenance request for ${selectedEquipment.equipment_code} - ${selectedEquipment.equipment_name}.`
                    });

            document.getElementById("maintenanceForm").reset();

            if (auditError) {
                console.error(
                    "Maintenance audit log error:",
                    auditError
                );

                showMaintenanceMessage(
                    `Maintenance request #${data.id} submitted, but its audit log could not be saved.`,
                    "error"
                );
            } else {
                showMaintenanceMessage(
                    `Maintenance request #${data.id} submitted successfully. Its status is Pending.`,
                    "success"
                );
            }

            await loadMaintenanceRecords();

        } catch (error) {
            console.error(
                "Unexpected submission error:",
                error
            );

            showMaintenanceMessage(
                error.message,
                "error"
            );

        } finally {
            submitButton.disabled = false;
            submitButton.textContent =
                "Submit Maintenance Request";
        }
    });

document
    .getElementById("maintenanceSearch")
    .addEventListener("input", renderMaintenanceRecords);

document
    .getElementById("maintenanceStatusFilter")
    .addEventListener("change", renderMaintenanceRecords);

document
    .getElementById("refreshMaintenanceBtn")
    .addEventListener("click", async () => {
        await loadMaintenanceEquipment();
        await loadMaintenanceRecords();
    });

initializeMaintenance();
