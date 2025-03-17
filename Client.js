//import
const spawn = require('child_process')
const dgram = require('dgram')
const fs = require('fs')
const os = require('os');
const { send } = require('process');
const {exec} = require('child_process');
const execSync = require('child_process').execSync;
const path = require('path');
//import

//Parameters
const Stunserver=''
const dev_os= os.platform() //win32 , linux

const client = dgram.createSocket('udp4');
Stunserver_Address = 'gwoo.n-e.kr' //stun서버주소
Stunserver_Port= 13421 //stun서버포트

const wg_exe='./wg.exe'
const wireguard_exe='./wireguard.exe'
let prikey = execSync(`powershell.exe -Command "& '${wg_exe}' genkey"`, { encoding: 'utf8' }).trim();
let pubkey=execSync(`powershell.exe -Command "echo '${prikey.trim()}'| & '${wg_exe}' pubkey"`, { encoding: 'utf8' }).trim();
const pubtool = /pub\[(.*?)\]/;
const tiptool = /TIP_\[(.*?)\]/;
const rtctool = /RTC_\[(.*?)\]/;

let conf_list=[];
const outputFile = path.join(__dirname, 'wg0.conf');
//Parameters

//main함수
function main() {
    client.on('error', (err) => {
        console.log(`Server error:\n${err.stack}`);
        client.close();
      });
    sendHeartbeat();
    client.on('message', (msg, rinfo) => {
        const response = msg.toString();
        console.log(response);
        if(response.startsWith('YONLIST')){
            setTimeout(sendHeartbeat, 3000);
        }
        if(response.startsWith('RTC_')){
            console.log('Received info from server');
            conf_list.push({ RTC_IP: trimer(response,rtctool), TIP_IP: trimer(response,tiptool), Pubkey: trimer(response,pubtool) }); 
        }
        if(response === 'WG_UP'){
            const my_conf = conf_list.find(conf=> conf.Pubkey === pubkey);
            conf_list = conf_list.filter(item => item.Pubkey !== pubkey);
            generateWGConfig(my_conf, conf_list, prikey, outputFile);
            client.close();
            // firewall_allow(my_conf.RTC_IP.split(':')[1]);
            exec(`powershell.exe -Command "& '${wireguard_exe}' /installtunnelservice '${outputFile}'"`, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error: ${error.message}`);
                    return;
                }
                console.log(stdout);
            });
        }
    });
}main();


function sendHeartbeat() {
    const message = Buffer.from('IWJN_pub['+pubkey+']');
    client.send(message, 0, message.length, Stunserver_Port, Stunserver_Address, (error) => {
        if (error) {
            console.error('Error sending heartbeat:', error);
        } else {
            console.log('Heartbeat sent');
        }
    });
}
function trimer(string,tool){
    let match = string.match(tool);
    let trimed = match ? match[1] : null;
    return trimed;
}

function my_IP_conf(my_conf, prikey){
    const parts = my_conf.RTC_IP.split(':');
    const l_port = parts.length > 1 ? parts[1] : 'No port specified';
    return `[Interface]
PrivateKey = ${prikey}
Address = ${my_conf.TIP_IP}/24
ListenPort = ${l_port}\n`;
}
function opp_IP(conf_list){
    return `[Peer]
PublicKey = ${conf_list.Pubkey}
AllowedIPs = ${conf_list.TIP_IP}/32
Endpoint = ${conf_list.RTC_IP}\n`;
}
function generateWGConfig(my_conf, peers, prikey, outputFile) {
    const interfaceConfig = my_IP_conf(my_conf, prikey);
    let peerConfigs = '';
    for (const peer of peers) {
        peerConfigs += opp_IP(peer);
        peerConfigs += '\n';
    }
    
    const fullConfig = interfaceConfig + '\n' + peerConfigs;
    
    fs.writeFile(outputFile, fullConfig, (err) => {
        if (err) throw err;
        console.log(`WireGuard config saved to ${outputFile}`);
    });
}

// //firewall rule
// function firewall_allow(UDP_Port){
//     exec(`powershell.exe -Command "New-NetFirewallRule -DisplayName "Allow UDP ${UDP_Port}" -Direction Inbound -Protocol UDP -LocalPort ${UDP_Port} -Action Allow"`, (error, stdout, stderr) => {
//         if (error) {
//             console.error(`Error: ${error.message}`);
//             return;
//         }
//         console.log(stdout);
//     });
// }
