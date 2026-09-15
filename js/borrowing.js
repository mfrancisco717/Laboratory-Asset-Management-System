let currentUser = null;

async function initializeBorrowing() {

    const {
        data: { user },
        error: userError
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
        window.location.href = "login.html";
        return;
    }

    currentUser = user;

    await loadEquipmentOptions();
    await loadMyRequests();
}

async function loadEquipmentOptions() {

    const select = document.getElementById("equipmentId");

    select.innerHTML = '<option value="">Loading equipment...</option>';

    const { data, error } = await supabaseClient
        .from("equipment")
        .select("id, equipment_code, equipment_name, quantity, status, laboratory")
        .eq("status", "Available")
        .order("equipment_code");

    if (error) {

        console.error("Equipment loading error:", error);

        select.innerHTML =
            '<option value="">Unable to load equipment</option>';

        document.getElementById("borrowMessage").textContent =
            "Error loading equipment: " + error.message;

        return;
    }

    select.innerHTML =
        '<option value="">Select Equipment</option>';

    if (!data || data.length === 0) {

        select.innerHTML =
            '<option value="">No available equipment</option>';

        document.getElementById("borrowMessage").textContent =
            "There is currently no available equipment.";

        return;
    }

    data.forEach(item => {

        const option = document.createElement("option");

        option.value = item.id;

        option.textContent =
            item.equipment_code +
            " - " +
            item.equipment_name +
            " (" +
            item.quantity +
            " available) - " +
            item.laboratory;

        select.appendChild(option);
    });
}

document
    .getElementById("borrowForm")
    .addEventListener("submit", async function(event) {

        event.preventDefault();

        const equipmentId =
            document.getElementById("equipmentId").value;

        const quantity =
            Number(document.getElementById("quantity").value);

        const purpose =
            document.getElementById("purpose").value.trim();

        const returnDate =
            document.getElementById("returnDate").value;

        const message =
            document.getElementById("borrowMessage");

        if (!equipmentId) {
            message.textContent =
                "Please select an equipment.";

            return;
        }

        if (quantity < 1) {
            message.textContent =
                "Quantity must be at least 1.";

            return;
        }

        if (!purpose) {
            message.textContent =
                "Please enter the purpose.";

            return;
        }

        if (!returnDate) {
            message.textContent =
                "Please select an expected return date.";

            return;
        }

        const { data: equipment, error: equipmentError } =
            await supabaseClient
                .from("equipment")
                .select("*")
                .eq("id", equipmentId)
                .single();

        if (equipmentError) {

            console.error(equipmentError);

            message.textContent =
                "Unable to check equipment: " +
                equipmentError.message;

            return;
        }

        if (!equipment) {

            message.textContent =
                "Equipment not found.";

            return;
        }

        if (equipment.status !== "Available") {

            message.textContent =
                "This equipment is not available.";

            return;
        }

        if (quantity > equipment.quantity) {

            message.textContent =
                "Requested quantity is greater than the available quantity.";

            return;
        }

        const { error } =
            await supabaseClient
                .from("borrowing_requests")
                .insert({
                    equipment_id: equipmentId,
                    requester_id: currentUser.id,
                    quantity: quantity,
                    purpose: purpose,
                    expected_return_date: returnDate,
                    status: "Pending"
                });

        if (error) {

            console.error(error);

            message.textContent =
                "Request failed: " + error.message;

            return;
        }

        message.textContent =
            "Borrowing request submitted successfully.";

        document.getElementById("borrowForm").reset();

        await loadEquipmentOptions();
        await loadMyRequests();
    });

async function loadMyRequests() {

    const table =
        document.getElementById("requestTable");

    const { data, error } =
        await supabaseClient
            .from("borrowing_requests")
            .select(`
                id,
                quantity,
                purpose,
                status,
                request_date,
                expected_return_date,
                equipment (
                    equipment_code,
                    equipment_name
                )
            `)
            .eq("requester_id", currentUser.id)
            .order("id", { ascending: false });

    if (error) {

        console.error("Request loading error:", error);

        return;
    }

    table.innerHTML = "";

    if (!data || data.length === 0) {

        table.innerHTML = `
            <tr>
                <td colspan="5">
                    No borrowing requests yet.
                </td>
            </tr>
        `;

        return;
    }

    data.forEach(request => {

        const row =
            document.createElement("tr");

        row.innerHTML = `
            <td>
                ${request.equipment
                    ? request.equipment.equipment_code +
                      " - " +
                      request.equipment.equipment_name
                    : "Unknown Equipment"}
            </td>

            <td>${request.quantity}</td>

            <td>${request.purpose}</td>

            <td>${request.status}</td>

            <td>
                ${new Date(request.request_date)
                    .toLocaleDateString()}
            </td>
        `;

        table.appendChild(row);
    });
}

initializeBorrowing();