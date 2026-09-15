async function loadAuditLogs() {

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) {
        window.location.href = "login.html";
        return;
    }

    const { data: profile } =
        await supabaseClient
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .single();

    if (!profile || profile.role !== "Administrator") {

        document.querySelector("main").innerHTML =
            "<h1>Access Denied</h1><p>Only Administrators can access this page.</p>";

        return;
    }

    const { data, error } =
        await supabaseClient
            .from("audit_logs")
            .select(`
                *,
                profiles (
                    full_name,
                    email
                )
            `)
            .order("created_at", { ascending: false });

    if (error) {
        console.error(error);
        return;
    }

    const table =
        document.getElementById("auditTable");

    data.forEach(log => {

        const row =
            document.createElement("tr");

        row.innerHTML = `
            <td>${log.profiles ? log.profiles.full_name : "Unknown"}</td>
            <td>${log.action}</td>
            <td>${log.module}</td>
            <td>${log.record_id || ""}</td>
            <td>${log.description}</td>
            <td>${new Date(log.created_at).toLocaleString()}</td>
        `;

        table.appendChild(row);
    });
}

loadAuditLogs();