import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { supabase } from '../integrations/supabase/client'

const Login = () => {
  return (
    <div className="flex justify-center items-center h-screen bg-gray-100">
        <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-lg shadow-md">
            <h2 className="text-2xl font-bold text-center">Đăng nhập</h2>
            <Auth
                supabaseClient={supabase}
                appearance={{ theme: ThemeSupa }}
                providers={[]}
                theme="light"
            />
        </div>
    </div>
  )
}

export default Login;