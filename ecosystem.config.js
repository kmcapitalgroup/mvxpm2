module.exports = {
  apps: [{
    name: 'multiversx-timestamp',
    script: 'src/app.js',
    cwd: process.cwd(),
    instances: 'max', // Utilise tous les CPU disponibles
    exec_mode: 'cluster',
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      PORT: 3000,
      REDIS_URL: 'redis://localhost:6379'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
      REDIS_URL: 'redis://localhost:6379',
      MULTIVERSX_NETWORK: 'mainnet',
      LOG_LEVEL: 'info'
    },
    // Logs
    log_file: './logs/combined.log',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Monitoring
    min_uptime: '10s',
    max_restarts: 10,
    
    // PM2 Plus monitoring configuration
    pmx: true,
    monitoring: {
      http: true,
      https: false,
      port: false,
      network: true,
      ports: true
    },
    
    // Custom metrics for PM2 Plus
    instance_var: 'INSTANCE_ID',
    source_map_support: true,
    
    // Advanced PM2 features
    kill_timeout: 5000,
    listen_timeout: 3000,
    
    // Health check
    health_check_grace_period: 3000
  }],
  
  deploy: {
    production: {
      user: 'ubuntu',
      host: ['your-server-ip'],
      ref: 'origin/main',
      repo: 'https://github.com/kmcapitalgroup/mvxpm2.git',
      path: '/var/www/mvxpm2',
      'pre-deploy-local': '',
      'post-deploy': 'npm install --production && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'git clone https://github.com/kmcapitalgroup/mvxpm2.git . && npm install --production'
    }
  }
};