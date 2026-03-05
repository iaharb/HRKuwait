// supabase/functions/welcome-email/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

serve(async (req) => {
    try {
        const { email, name, role, password } = await req.json()

        console.log(`Sending welcome email to ${name} (${email})...`)

        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
                from: 'HR Portal <onboarding@resend.dev>',
                to: email,
                subject: `Welcome to the Enterprise HR Portal, ${name}!`,
                html: `
          <div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
            <h1 style="color: #4f46e5;">Welcome to the Portal!</h1>
            <p>Hello <strong>${name}</strong>,</p>
            <p>Your enterprise account has been successfully provisioned. You can now access the HR Portal with the following credentials:</p>
            
            <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>Role:</strong> ${role}</p>
              <p style="margin: 5px 0;"><strong>Username:</strong> ${email}</p>
              <p style="margin: 5px 0;"><strong>Password:</strong> ${password}</p>
            </div>

            <p>Please log in and update your password immediately for security purposes.</p>
            
            <p style="margin-top: 30px;">Best regards,<br>The HR Technology Team</p>
          </div>
        `,
            }),
        })

        const data = await res.json()
        return new Response(JSON.stringify(data), {
            status: res.status,
            headers: { 'Content-Type': 'application/json' }
        })

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        })
    }
})
