import React, { useState } from 'react';
import { Input, Button, message } from 'antd';
import { CloudOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { login } from '../api';

interface LoginProps {
  onLoginSuccess: () => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!password) return;
    setLoading(true);
    try {
      const data = await login(password);
      if (data.token) {
        localStorage.setItem('token', data.token);
        message.success('欢迎回来');
        onLoginSuccess();
      } else {
        // No password required case, usually handled by initial check but just in case
        onLoginSuccess();
      }
    } catch (error) {
      message.error('密码错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      height: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: '#fcfcfc',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    }}>
      <div style={{ textAlign: 'center', width: '100%', maxWidth: '400px', padding: '20px' }}>
        <div style={{ marginBottom: '40px' }}>
          <div style={{ 
            fontSize: '48px', 
            fontWeight: '300', 
            color: '#333', 
            marginBottom: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '15px'
          }}>
            <CloudOutlined style={{ color: '#1890ff' }} />
            <span>云简</span>
          </div>
          <div style={{ 
            fontSize: '16px', 
            color: '#888', 
            letterSpacing: '2px',
            fontWeight: '300'
          }}>
            墨染云间，书尽简意
          </div>
        </div>

        <Input.Password
          placeholder="请输入访问密码"
          size="large"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onPressEnter={handleLogin}
          style={{ 
            borderRadius: '8px', 
            marginBottom: '20px',
            padding: '12px 16px',
            fontSize: '16px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
          }}
        />

        <Button 
          type="primary" 
          size="large" 
          block 
          onClick={handleLogin}
          loading={loading}
          style={{ 
            height: '48px', 
            fontSize: '16px', 
            borderRadius: '8px',
            background: '#1890ff',
            boxShadow: '0 4px 12px rgba(24, 144, 255, 0.2)'
          }}
        >
          进入 <ArrowRightOutlined />
        </Button>
      </div>
    </div>
  );
};

export default Login;
