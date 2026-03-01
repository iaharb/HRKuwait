import { createClient } from "@supabase/supabase-js";
import { MOCK_EMPLOYEES } from "./constants";
import dotenv from "dotenv";

dotenv.config();

const url = process.env.VITE_SUPABASE_URL || "";
const key = process.env.VITE_SUPABASE_ANON_KEY || "";

const supabase = createClient(url, key);

async function sync() {
    console.log("Starting sync with URL", url.substring(0, 15) + "...");
    for (const emp of MOCK_EMPLOYEES) {
        console.log("Updating", emp.name);
        const { error } = await supabase.from("employees").update({ leave_balances: emp.leaveBalances }).eq("id", emp.id);
        if (error) {
            console.error("Error updating", emp.name, error);
        } else {
            console.log("Successfully updated", emp.name, emp.leaveBalances);
        }
    }
    console.log("Sync complete");
}

sync();
