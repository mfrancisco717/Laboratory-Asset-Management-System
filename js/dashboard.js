async function loadDashboard() {

    const message =
        document.getElementById("dashboardMessage");

    try {

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
            .select("role")
            .eq("id", user.id)
            .single();

        if (profileError) {
            throw profileError;
        }

        const {
            count: totalEquipment,
            error: totalError
        } = await supabaseClient
            .from("equipment")
            .select("*", {
                count: "exact",
                head: true
            });

        if (totalError) {
            throw totalError;
        }

        const {
            count: availableEquipment,
            error: availableError
        } = await supabaseClient
            .from("equipment")
            .select("*", {
                count: "exact",
                head: true
            })
            .eq("status", "Available");

        if (availableError) {
            throw availableError;
        }

        const {
            count: borrowedEquipment,
            error: borrowedError
        } = await supabaseClient
            .from("equipment")
            .select("*", {
                count: "exact",
                head: true
            })
            .eq("status", "Borrowed");

        if (borrowedError) {
            throw borrowedError;
        }

        let pendingRequests = 0;

        if (profile.role === "Administrator") {

            const {
                count,
                error
            } = await supabaseClient
                .from("borrowing_requests")
                .select("*", {
                    count: "exact",
                    head: true
                })
                .eq("status", "Pending");

            if (error) {
                throw error;
            }

            pendingRequests = count || 0;

        } else {

            const {
                count,
                error
            } = await supabaseClient
                .from("borrowing_requests")
                .select("*", {
                    count: "exact",
                    head: true
                })
                .eq("requester_id", user.id)
                .eq("status", "Pending");

            if (error) {
                throw error;
            }

            pendingRequests = count || 0;
        }

        document.getElementById("totalEquipment").textContent =
            totalEquipment || 0;

        document.getElementById("availableEquipment").textContent =
            availableEquipment || 0;

        document.getElementById("borrowedEquipment").textContent =
            borrowedEquipment || 0;

        document.getElementById("pendingRequests").textContent =
            pendingRequests;

        if (message) {
            message.textContent = "";
        }

    } catch (error) {

        console.error("Dashboard error:", error);

        if (message) {
            message.textContent =
                "Unable to load dashboard data: " +
                error.message;
        }
    }
}

loadDashboard();