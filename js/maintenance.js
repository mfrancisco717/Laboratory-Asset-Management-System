let maintenanceUser = null;

async function initializeMaintenance() {

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) {
        window.location.href = "login.html";
        return;
    }

    maintenanceUser = user;

    loadMaintenanceEquipment();
}

async function loadMaintenanceEquipment() {

    const { data, error } =
        await supabaseClient
            .from("equipment")
            .select("*");

    if (error) {
        console.error(error);
        return;
    }

    const select =
        document.getElementById("maintenanceEquipment");

    data.forEach(item => {

        const option =
            document.createElement("option");

        option.value = item.id;

        option.textContent =
            item.equipment_code + " - " +
            item.equipment_name;

        select.appendChild(option);
    });
}

document
    .getElementById("maintenanceForm")
    .addEventListener("submit", async function(event) {

        event.preventDefault();

        const equipmentId =
            document.getElementById("maintenanceEquipment").value;

        const problem =
            document.getElementById("problemDescription").value;

        const { error } =
            await supabaseClient
                .from("maintenance_requests")
                .insert({
                    equipment_id: equipmentId,
                    requester_id: maintenanceUser.id,
                    problem_description: problem,
                    status: "Pending"
                });

        const message =
            document.getElementById("maintenanceMessage");

        if (error) {
            message.textContent = error.message;
            return;
        }

        message.textContent =
            "Maintenance request submitted successfully.";

        document.getElementById("maintenanceForm").reset();
    });

initializeMaintenance();