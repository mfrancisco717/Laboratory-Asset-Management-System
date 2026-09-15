async function loadEquipment() {

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) {
        window.location.href = "login.html";
        return;
    }

    const { data, error } =
        await supabaseClient
            .from("equipment")
            .select("*")
            .order("id");

    if (error) {
        console.error(error);
        return;
    }

    const table = document.getElementById("equipmentTable");

    table.innerHTML = "";

    data.forEach(item => {

        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${item.equipment_code}</td>
            <td>${item.equipment_name}</td>
            <td>${item.category}</td>
            <td>${item.quantity}</td>
            <td>${item.status}</td>
            <td>${item.laboratory}</td>
        `;

        table.appendChild(row);
    });
}

loadEquipment();