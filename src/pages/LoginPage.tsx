import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

const LoginPage = () => {
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
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-center text-gray-900">
          Đăng nhập vào tài khoản
        </h2>
        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa }}
          providers={[]}
          theme="light"
          localization={{
            variables: {
              sign_in: {
                email_label: 'Địa chỉ email',
                password_label: 'Mật khẩu',
                button_label: 'Đăng nhập',
                social_provider_text: 'Đăng nhập với {{provider}}',
                link_text: 'Đã có tài khoản? Đăng nhập',
              },
              sign_up: {
                email_label: 'Địa chỉ email',
                password_label: 'Mật khẩu',
                button_label: 'Đăng ký',
                link_text: 'Chưa có tài khoản? Đăng ký',
              },
              forgotten_password: {
                email_label: 'Địa chỉ email',
                button_label: 'Gửi hướng dẫn',
                link_text: 'Quên mật khẩu?',
              },
            },
          }}
        />
      </div>
    </div>
  );
};

export default LoginPage;