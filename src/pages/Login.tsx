import { supabase } from '@/integrations/supabase/client';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

const Login = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        navigate('/');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-100 via-purple-100 to-orange-100 p-4">
      <div className="absolute top-8 flex items-center">
        <img
          src={"/logo.png"}
          className="w-44 h-9 object-contain"
          alt="Torse.ai logo"
        />
      </div>

      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-2xl shadow-xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900">Welcome Back!</h2>
          <p className="mt-2 text-sm text-gray-600">We missed you! Please enter your details.</p>
        </div>
        <Auth
          supabaseClient={supabase}
          appearance={{
            theme: ThemeSupa,
            className: {
              button: 'bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg py-2.5 transition-colors',
              input: 'rounded-lg border-gray-300 focus:ring-orange-500 focus:border-orange-500 transition-colors',
              label: 'text-sm font-medium text-gray-700',
              anchor: 'text-sm text-orange-600 hover:text-orange-700',
              divider: 'bg-gray-200',
              message: 'text-sm text-red-600',
            },
          }}
          providers={[]}
          theme="light"
          localization={{
            variables: {
              sign_in: {
                email_label: 'Email',
                password_label: 'Password',
                email_input_placeholder: 'Enter your Email',
                password_input_placeholder: 'Enter Password',
                button_label: 'Sign in',
                social_provider_text: 'Sign in with {{provider}}',
                link_text: "Don't have an account? Sign up",
              },
              forgotten_password: {
                link_text: 'Forgot password?',
              },
            },
          }}
        />
      </div>
    </div>
  );
};

export default Login;