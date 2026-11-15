# local
cp .env.example .env            # fill DEPLOYER_PRIVATE_KEY and TREASURY_ADDRESS
npm install --legacy-peer-deps
npx hardhat compile
npx hardhat test
npx hardhat run scripts/deploy.js --network bsc

# Ubuntu VPS
sudo apt update && sudo apt install -y nodejs npm nginx
sudo npm i -g n pm2 && n 22
pm2 start backend/server.js --name router && pm2 save
pm2 logs router
