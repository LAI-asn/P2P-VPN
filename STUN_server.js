//import
const spawn = require('child_process')
const dgram = require('dgram')
const fs = require('fs')
const os = require('os');
const readline = require('readline');
const EventEmitter = require('events');
const eventEmitter = new EventEmitter();
//import

//Parameters
const Stunserver=''
const dev_os= os.platform() //win32 , linux
const target_connect=2

const R_Port = 13421
const server= dgram.createSocket('udp4')
let w_list=[]
let w_trigger=false;

const wg_exe='./wg.exe'
const wireguard_exe='./wireguard.exe'
const pubtool = /pub\[(.*?)\]/;
const tiptool = /TIP_\[(.*?)\]/;
const rtctool = /RTC_\[(.*?)\]/;
//Parameters



function main(){
    server.on('error', (err) => {
        console.log(`Server error:\n${err.stack}`);
        server.close();
      });
      server.on('listening', () => {
        const address = server.address();
        console.log(`Server listening ${address.address}:${address.port}`);
      });
      server.bind(R_Port);

      server.on('message', (msg, rinfo) => {
        if(w_trigger){
            console.log('w_trigger is true')
            reply_nw(rinfo);
            return
        }
        console.log(`Server received: ${msg} from ${rinfo.address}:${rinfo.port}`);
        if(msg.toString().startsWith('IWJN_')){
            let match = msg.toString().match(pubtool);
            let pubkeyExtracted = match ? match[1] : null;
            w_list_add(rinfo,pubkeyExtracted);
            if(w_list.length>=target_connect){eventEmitter.emit('w_list_full');}
            if(!w_trigger){reply(rinfo);}
        }
      });
    
}main();
// 이벤트 리스너 등록
eventEmitter.on('w_list_full', () => {
    w_trigger=true;
    for(let i=0;i<w_list.length;i++){
        let tmp_ip='10.0.10.'+(i+1);
        w_list[i].tip=tmp_ip;
    }
    for(let i=0;i<w_list.length;i++){
        let msg=Buffer.from('RTC_['+w_list[i].address+':'+w_list[i].receivedPort+']TIP_['+w_list[i].tip+']-pub['+w_list[i].pubkey+']');
        for(let j=0;j<w_list.length;j++){
            server.send(msg,0,msg.length,w_list[j].receivedPort,w_list[j].address,(err)=>{
                if(err){
                    console.log(err);
                }
            });
        }
    }
    for(let i=0;i<w_list.length;i++){
        let msg=Buffer.from('WG_UP');
        server.send(msg,0,msg.length,w_list[i].receivedPort,w_list[i].address,(err)=>{
            if(err){
                console.log(err);
            }
        });
    }
    console.log(w_list);
    w_list=[];
});
function reply_nw(rinfo){
    const reply= Buffer.from('STUN cooldown');
    server.send(reply,0,reply.length,rinfo.port,rinfo.address,(err)=>{
        if(err){
            console.log(err);
        }
        else{
            console.log(`Server sent: ${reply} to ${rinfo.address}:${rinfo.port}`);
        }
    });

}
function reply(rinfo){
    const reply= Buffer.from('YONLIST_wait');
    server.send(reply,0,reply.length,rinfo.port,rinfo.address,(err)=>{
        if(err){
            console.log(err);
        }
        else{
            console.log(`Server sent: ${reply} to ${rinfo.address}:${rinfo.port}`);
        }
    });
}

function w_list_add(rinfo,pubkey){
    // Update or add IP in heartbeatIPs array with current timestamp and public key
    const existingIp = w_list.find(ipInfo => ipInfo.address === rinfo.address ); //포트가 다른건 나중에 제거예정
    if (existingIp) {
        existingIp.lastHeartbeatTime = Date.now(); // IP가 이미 존재하면 시간 갱신
        existingIp.pubkey = pubkey; // Update the public key as a string
        existingIp.receivedPort = rinfo.port;
    } else {
        w_list.push({ address: rinfo.address, receivedPort: rinfo.port, lastHeartbeatTime: Date.now(), pubkey }); // 새 IP 추가
    }
}
// Check heartbeat every 15 seconds
setInterval(() => {
    const currentTime = Date.now();
    w_list = w_list.filter(ipInfo => currentTime - ipInfo.lastHeartbeatTime <= 15000); // 15초 이상 지난 IP 제거
    if(w_list.length<2){w_trigger=false;}
}, 15000);