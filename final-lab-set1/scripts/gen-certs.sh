#!/bin/bash
# สร้าง self-signed certificate สำหรับ development
mkdir -p nginx/certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/certs/key.pem \
  -out    nginx/certs/cert.pem \
  -subj "/C=TH/ST=Bangkok/L=Bangkok/O=RMUTL/OU=ENGCE301/CN=localhost"
echo "✅ Certificate created in nginx/certs/"