let currentAdmin = null;

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

                <p>
                    There was a problem checking your Administrator account.
                </p>

                <p>
                    ${profileError.message}
                </p>

            </div>
        `;

        return;
    }

    if (!profile || profile.role !== "Administrator") {

        document.querySelector("main").innerHTML = `
            <div class="access-denied">

                <h1>Access Denied</h1>

                <p>
                    Only Administrators can access this page.
                </p>

            </div>
        `;

        return;
    }

    currentAdmin = user;

    await loadUsers();
}

async function loadUsers() {

    const table =
        document.getElementById("usersTable");

    table.innerHTML = `
        <tr>
            <td colspan="4">
                Loading users...
            </td>
        </tr>
    `;

    const {
        data,
        error
    } = await supabaseClient
        .from("profiles")
        .select("id, full_name, email, role, created_at")
        .order("created_at", {
            ascending: true
        });

    if (error) {

        console.error("Users loading error:", error);

        table.innerHTML = `
            <tr>
                <td colspan="4">
                    Unable to load users.
                </td>
            </tr>
        `;

        return;
    }

    table.innerHTML = "";

    if (!data || data.length === 0) {

        table.innerHTML = `
            <tr>
                <td colspan="4">
                    No users found.
                </td>
            </tr>
        `;

        return;
    }

    data.forEach(item => {

        const row =
            document.createElement("tr");

        row.innerHTML = `
            <td>${item.full_name}</td>

            <td>${item.email}</td>

            <td>${item.role}</td>

            <td>
                ${new Date(item.created_at)
                    .toLocaleDateString()}
            </td>
        `;

        table.appendChild(row);
    });
}

document
    .getElementById("userForm")
    .addEventListener("submit", async function(event) {

        event.preventDefault();

        const userId =
            document.getElementById("userId").value.trim();

        const fullName =
            document.getElementById("fullName").value.trim();

        const email =
            document.getElementById("email").value.trim();

        const role =
            document.getElementById("role").value;

        const message =
            document.getElementById("userMessage");

        if (!userId) {

            message.textContent =
                "Please enter the Supabase Auth User ID.";

            return;
        }

        if (!fullName) {

            message.textContent =
                "Please enter the user's full name.";

            return;
        }

        if (!email) {

            message.textContent =
                "Please enter the user's email.";

            return;
        }

        if (!role) {

            message.textContent =
                "Please select a role.";

            return;
        }

        const {
            data: existingUser,
            error: existingError
        } = await supabaseClient
            .from("profiles")
            .select("id")
            .eq("id", userId)
            .maybeSingle();

        if (existingError) {

            console.error(existingError);

            message.textContent =
                "Unable to check existing user.";

            return;
        }

        if (existingUser) {

            message.textContent =
                "A profile for this Auth User ID already exists.";

            return;
        }

        const {
            error
        } = await supabaseClient
            .from("profiles")
            .insert({
                id: userId,
                full_name: fullName,
                email: email,
                role: role
            });

        if (error) {

            console.error("Add user error:", error);

            message.textContent =
                "Failed to add user: " + error.message;

            return;
        }

        message.textContent =
            "User profile added successfully.";

        document
            .getElementById("userForm")
            .reset();

        await loadUsers();
    });

checkAdmin();