let adminUser = null;
let adminProfile = null;

async function checkAdmin() {

    const {
        data: { user },
        error: userError
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
        window.location.href = "login.html";
        return;
    }

    const {
        data: profile,
        error: profileError
    } = await supabaseClient
        .from("profiles")
        .select("id, full_name, email, role")
        .eq("id", user.id)
        .single();

    if (profileError) {

        console.error("Profile error:", profileError);

        document.querySelector("main").innerHTML = `
            <div class="access-denied">
                <h1>Unable to Verify Role</h1>
                <p>There was a problem checking your account role.</p>
                <p>${profileError.message}</p>
            </div>
        `;

        return;
    }

    if (!profile || profile.role !== "Administrator") {

        document.querySelector("main").innerHTML = `
            <div class="access-denied">
                <h1>Access Denied</h1>
                <p>Only Administrators can access this page.</p>
            </div>
        `;

        return;
    }

    adminUser = user;
    adminProfile = profile;

    await loadPendingRequests();
}

async function loadPendingRequests() {

    const table =
        document.getElementById("approvalTable");

    const message =
        document.getElementById("approvalMessage");

    table.innerHTML = `
        <tr>
            <td colspan="6">Loading pending requests...</td>
        </tr>
    `;

    const { data, error } =
        await supabaseClient
            .from("borrowing_requests")
            .select(`
                id,
                requester_id,
                quantity,
                purpose,
                status,
                request_date,
                equipment (
                    equipment_code,
                    equipment_name
                ),
                profiles!borrowing_requests_requester_id_fkey (
                    full_name
                )
            `)
            .eq("status", "Pending")
            .order("id", { ascending: false });

    if (error) {

        console.error("Loading requests error:", error);

        table.innerHTML = `
            <tr>
                <td colspan="6">
                    Unable to load borrowing requests.
                </td>
            </tr>
        `;

        message.textContent =
            "Error: " + error.message;

        return;
    }

    table.innerHTML = "";

    if (!data || data.length === 0) {

        table.innerHTML = `
            <tr>
                <td colspan="6">
                    No pending borrowing requests.
                </td>
            </tr>
        `;

        return;
    }

    data.forEach(request => {

        const row =
            document.createElement("tr");

        const requesterName =
            request.profiles
                ? request.profiles.full_name
                : "Unknown Requester";

        const equipmentName =
            request.equipment
                ? request.equipment.equipment_code +
                  " - " +
                  request.equipment.equipment_name
                : "Unknown Equipment";

        row.innerHTML = `
            <td>${requesterName}</td>

            <td>${equipmentName}</td>

            <td>${request.quantity}</td>

            <td>${request.purpose}</td>

            <td>
                <span class="status-pending">
                    ${request.status}
                </span>
            </td>

            <td>
                ${
                    request.requester_id === adminUser.id
                    ? `<span>Own Request</span>`
                    : `
                        <button onclick="approveRequest(${request.id})">
                            Approve
                        </button>

                        <button onclick="rejectRequest(${request.id})">
                            Reject
                        </button>
                    `
                }
            </td>
        `;

        table.appendChild(row);
    });
}

async function approveRequest(requestId) {

    const message =
        document.getElementById("approvalMessage");

    const {
        data: request,
        error: requestError
    } = await supabaseClient
        .from("borrowing_requests")
        .select("id, requester_id, status")
        .eq("id", requestId)
        .single();

    if (requestError || !request) {

        message.textContent =
            "Unable to find the borrowing request.";

        return;
    }

    if (request.requester_id === adminUser.id) {

        message.textContent =
            "You cannot approve your own request.";

        return;
    }

    if (request.status !== "Pending") {

        message.textContent =
            "Only pending requests can be approved.";

        return;
    }

    const { error } =
        await supabaseClient
            .from("borrowing_requests")
            .update({
                status: "Approved",
                approved_by: adminUser.id,
                approved_at: new Date().toISOString()
            })
            .eq("id", requestId)
            .eq("status", "Pending");

    if (error) {

        console.error("Approval error:", error);

        message.textContent =
            "Approval failed: " + error.message;

        return;
    }

    const { error: auditError } =
        await supabaseClient
            .from("audit_logs")
            .insert({
                user_id: adminUser.id,
                action: "APPROVED",
                module: "Borrowing",
                record_id: requestId,
                description:
                    "Approved borrowing request."
            });

    if (auditError) {

        console.error("Audit log error:", auditError);

        message.textContent =
            "Request approved, but audit log failed.";

    } else {

        message.textContent =
            "Borrowing request approved successfully.";
    }

    await loadPendingRequests();
}

async function rejectRequest(requestId) {

    const message =
        document.getElementById("approvalMessage");

    const {
        data: request,
        error: requestError
    } = await supabaseClient
        .from("borrowing_requests")
        .select("id, requester_id, status")
        .eq("id", requestId)
        .single();

    if (requestError || !request) {

        message.textContent =
            "Unable to find the borrowing request.";

        return;
    }

    if (request.requester_id === adminUser.id) {

        message.textContent =
            "You cannot reject your own request.";

        return;
    }

    if (request.status !== "Pending") {

        message.textContent =
            "Only pending requests can be rejected.";

        return;
    }

    const { error } =
        await supabaseClient
            .from("borrowing_requests")
            .update({
                status: "Rejected",
                approved_by: adminUser.id,
                approved_at: new Date().toISOString()
            })
            .eq("id", requestId)
            .eq("status", "Pending");

    if (error) {

        console.error("Rejection error:", error);

        message.textContent =
            "Rejection failed: " + error.message;

        return;
    }

    const { error: auditError } =
        await supabaseClient
            .from("audit_logs")
            .insert({
                user_id: adminUser.id,
                action: "REJECTED",
                module: "Borrowing",
                record_id: requestId,
                description:
                    "Rejected borrowing request."
            });

    if (auditError) {

        console.error("Audit log error:", auditError);

        message.textContent =
            "Request rejected, but audit log failed.";

    } else {

        message.textContent =
            "Borrowing request rejected successfully.";
    }

    await loadPendingRequests();
}

checkAdmin();