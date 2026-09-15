async function loadReturns() {

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) {
        window.location.href = "login.html";
        return;
    }

    const { data, error } =
        await supabaseClient
            .from("borrowing_requests")
            .select(`
                *,
                equipment (
                    equipment_code,
                    equipment_name
                )
            `)
            .eq("status", "Released")
            .order("id");

    if (error) {
        console.error(error);
        return;
    }

    const table =
        document.getElementById("returnTable");

    table.innerHTML = "";

    data.forEach(request => {

        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${request.id}</td>
            <td>${request.equipment.equipment_code} - ${request.equipment.equipment_name}</td>
            <td>${request.quantity}</td>
            <td>${request.status}</td>
            <td>
                <button onclick="returnEquipment(${request.id}, ${request.equipment_id})">
                    Return
                </button>
            </td>
        `;

        table.appendChild(row);
    });
}

async function returnEquipment(requestId, equipmentId) {

    const { error: requestError } =
        await supabaseClient
            .from("borrowing_requests")
            .update({
                status: "Returned",
                returned_at: new Date().toISOString()
            })
            .eq("id", requestId)
            .eq("status", "Released");

    if (requestError) {
        console.error(requestError);
        return;
    }

    await supabaseClient
        .from("equipment")
        .update({
            status: "Available"
        })
        .eq("id", equipmentId);

    loadReturns();
}

loadReturns();