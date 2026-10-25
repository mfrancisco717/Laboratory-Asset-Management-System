let adminUser = null;
let adminProfile = null;
let processingRequests = new Set();

// Check whether the current user is an Administrator
async function checkAdmin() {
    const {
        data: { user },
        error: userError
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
        window.location.href = "login.html";
        return;
    }

    const { data: profile, error: profileError } =
        await supabaseClient
            .from("profiles")
            .select("id, full_name, email, role")
            .eq("id", user.id)
            .single();

    if (profileError || !profile) {
        console.error("Profile error:", profileError);

        showAccessMessage(
            "Unable to Verify Role",
            profileError?.message ||
                "Your profile could not be found."
        );
        return;
    }

    if (profile.role !== "Administrator") {
        showAccessMessage(
            "Access Denied",
            "Only Administrators can access this page."
        );
        return;
    }

    adminUser = user;
    adminProfile = profile;

    await loadPendingRequests();
}

function showAccessMessage(title, description) {
    const main = document.querySelector("main");
    if (!main) return;

    main.replaceChildren();

    const container = document.createElement("div");
    container.className = "access-denied";

    const heading = document.createElement("h1");
    heading.textContent = title;

    const paragraph = document.createElement("p");
    paragraph.textContent = description;

    container.append(heading, paragraph);
    main.appendChild(container);
}

function createCell(value) {
    const cell = document.createElement("td");

    cell.textContent =
        value === null || value === undefined || value === ""
            ? "—"
            : String(value);

    return cell;
}

function showApprovalMessage(message, isError = false) {
    const element = document.getElementById("approvalMessage");
    if (!element) return;

    element.textContent = message;
    element.classList.toggle("error-message", isError);
}

function setApprovalTableMessage(message) {
    const table = document.getElementById("approvalTable");
    if (!table) return;

    table.replaceChildren();

    const row = document.createElement("tr");
    const cell = createCell(message);

    cell.colSpan = 6;
    row.appendChild(cell);
    table.appendChild(row);
}

// Load pending borrowing requests
async function loadPendingRequests() {
    const table = document.getElementById("approvalTable");

    if (!table) {
        console.error("Approval table was not found.");
        return;
    }

    showApprovalMessage("");
    setApprovalTableMessage("Loading pending requests...");

    try {
        const { data: requests, error } = await supabaseClient
            .from("borrowing_requests")
            .select(`
                id,
                requester_id,
                equipment_id,
                quantity,
                purpose,
                status,
                request_date,
                equipment (
                    equipment_code,
                    equipment_name
                )
            `)
            .eq("status", "Pending")
            .order("id", { ascending: false });

        if (error) throw error;

        if (!requests || requests.length === 0) {
            setApprovalTableMessage(
                "No pending borrowing requests."
            );
            return;
        }

        // Retrieve requester profiles through the secure function.
        const requesterIds = [
            ...new Set(
                requests
                    .map(request => request.requester_id)
                    .filter(Boolean)
            )
        ];

        let profilesById = new Map();

        if (requesterIds.length > 0) {
            const { data: profiles, error: profileError } =
                await supabaseClient.rpc(
                    "get_maintenance_requester_profiles",
                    {
                        requester_ids: requesterIds
                    }
                );

            if (profileError) {
                console.error(
                    "Requester profile loading error:",
                    profileError
                );

                showApprovalMessage(
                    "Requests loaded, but requester names could not be retrieved: " +
                        profileError.message,
                    true
                );
            } else {
                profilesById = new Map(
                    (profiles || []).map(profile => [
                        profile.id,
                        profile
                    ])
                );
            }
        }

        table.replaceChildren();

        requests.forEach(request => {
            const row = document.createElement("tr");
            const requester = profilesById.get(
                request.requester_id
            );

            const requesterName = requester
                ? requester.full_name ||
                    requester.email ||
                    "Name not set"
                : "Profile unavailable";

            const equipment = request.equipment || {};

            const equipmentName = [
                equipment.equipment_code,
                equipment.equipment_name
            ].filter(Boolean).join(" - ") || "Unknown Equipment";

            row.appendChild(createCell(requesterName));
            row.appendChild(createCell(equipmentName));
            row.appendChild(createCell(request.quantity));
            row.appendChild(createCell(request.purpose));

            const statusCell = document.createElement("td");
            const statusBadge = document.createElement("span");

            statusBadge.className = "status-pending";
            statusBadge.textContent = request.status;

            statusCell.appendChild(statusBadge);
            row.appendChild(statusCell);

            const actionCell = document.createElement("td");

            if (request.requester_id === adminUser.id) {
                actionCell.textContent = "Own Request";
            } else {
                const approveButton =
                    document.createElement("button");

                approveButton.type = "button";
                approveButton.textContent = "Approve";
                approveButton.addEventListener("click", () => {
                    processBorrowingRequest(
                        request.id,
                        "Approved",
                        approveButton
                    );
                });

                const rejectButton =
                    document.createElement("button");

                rejectButton.type = "button";
                rejectButton.textContent = "Reject";
                rejectButton.addEventListener("click", () => {
                    processBorrowingRequest(
                        request.id,
                        "Rejected",
                        rejectButton
                    );
                });

                actionCell.append(
                    approveButton,
                    document.createTextNode(" "),
                    rejectButton
                );
            }

            row.appendChild(actionCell);
            table.appendChild(row);
        });
    } catch (error) {
        console.error("Loading approval requests failed:", error);

        setApprovalTableMessage(
            "Unable to load pending borrowing requests."
        );

        showApprovalMessage(
            "Error loading requests: " + error.message,
            true
        );
    }
}

// Approve or reject a pending borrowing request
async function processBorrowingRequest(
    requestId,
    newStatus,
    clickedButton
) {
    if (!adminUser || !adminProfile) {
        showApprovalMessage(
            "Your Administrator account has not been verified.",
            true
        );
        return;
    }

    if (!["Approved", "Rejected"].includes(newStatus)) {
        showApprovalMessage("Invalid request status.", true);
        return;
    }

    if (processingRequests.has(requestId)) return;

    const confirmed = window.confirm(
        `${newStatus === "Approved" ? "Approve" : "Reject"} ` +
        `borrowing request #${requestId}?`
    );

    if (!confirmed) return;

    processingRequests.add(requestId);

    const originalText = clickedButton.textContent;
    clickedButton.disabled = true;
    clickedButton.textContent = "Processing...";

    try {
        // Read the latest request status before updating.
        const { data: request, error: requestError } =
            await supabaseClient
                .from("borrowing_requests")
                .select("id, requester_id, status")
                .eq("id", requestId)
                .single();

        if (requestError || !request) {
            throw requestError ||
                new Error("Borrowing request not found.");
        }

        if (request.requester_id === adminUser.id) {
            throw new Error(
                "You cannot approve or reject your own request."
            );
        }

        if (request.status !== "Pending") {
            showApprovalMessage(
                "This request is no longer pending. The list will refresh.",
                true
            );

            await loadPendingRequests();
            return;
        }

        // Update only if the request is still Pending.
        const { data: updatedRequest, error: updateError } =
            await supabaseClient
                .from("borrowing_requests")
                .update({
                    status: newStatus,
                    approved_by: adminUser.id,
                    approved_at: new Date().toISOString()
                })
                .eq("id", requestId)
                .eq("status", "Pending")
                .select("id, status")
                .maybeSingle();

        if (updateError) throw updateError;

        if (!updatedRequest) {
            showApprovalMessage(
                "No update was made. The request may have changed, or your database permissions may not allow this action.",
                true
            );

            await loadPendingRequests();
            return;
        }

        // Record the decision in audit logs.
        const { error: auditError } = await supabaseClient
            .from("audit_logs")
            .insert({
                user_id: adminUser.id,
                action: newStatus.toUpperCase(),
                module: "Borrowing",
                record_id: requestId,
                description:
                    `${newStatus} borrowing request #${requestId}.`
            });

        if (auditError) {
            console.error("Audit log error:", auditError);

            showApprovalMessage(
                `Request #${requestId} was ${newStatus.toLowerCase()}, but its audit log could not be saved: ${auditError.message}`,
                true
            );
        } else {
            showApprovalMessage(
                `Borrowing request #${requestId} ${newStatus.toLowerCase()} successfully.`,
                false
            );
        }

        // The request disappears from this page because it is no
        // longer Pending. It remains in the Borrowing Report.
        await loadPendingRequests();

    } catch (error) {
        console.error("Borrowing decision failed:", error);

        showApprovalMessage(
            "Unable to process request: " + error.message,
            true
        );
    } finally {
        processingRequests.delete(requestId);
        clickedButton.disabled = false;
        clickedButton.textContent = originalText;
    }
}

// Keep compatibility with existing HTML onclick handlers, if any.
async function approveRequest(requestId) {
    const button = document.querySelector(
        `#approvalTable button[data-request-id="${requestId}"][data-status="Approved"]`
    );

    if (button) {
        await processBorrowingRequest(
            requestId,
            "Approved",
            button
        );
    }
}

async function rejectRequest(requestId) {
    const button = document.querySelector(
        `#approvalTable button[data-request-id="${requestId}"][data-status="Rejected"]`
    );

    if (button) {
        await processBorrowingRequest(
            requestId,
            "Rejected",
            button
        );
    }
}

checkAdmin();