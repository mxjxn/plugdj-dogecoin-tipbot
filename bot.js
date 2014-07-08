(function() {

var PlugAPI = require('plugapi'),

    nconf = require('nconf');

    nconf.file("config.json")
        .file("secret_config.json")
        .defaults({
            "doge":{"user":false,"pass":false},
            "plug":{"auth":false,"room":false}
        });

var AUTH = nconf.get('plug:auth'),
    ROOM = nconf.get('plug:room');
    DOGE_USER = nconf.get("doge:user"),
    DOGE_PASS = nconf.get("doge:pass"),
    bot = new PlugAPI(AUTH),
    insult = nconf.get('insult'),
    tx_fee = nconf.get('tx_fee'),
    currentDJ="";

if(!AUTH || !ROOM){
    console.log('missing config');
    return false;
}

/* REDIS STUFF */
var redis = require('redis'),
    rClient = rClient || redis.createClient(),

/* REPL */
    repl = require('repl'),
    botrepl = repl.start("bot>"),
/* DOGECOIN */
    dogecoin = require('node-dogecoin')();

// INITIALIZE BOT,DOGE,REDIS

bot.connect(ROOM);
dogecoin.auth(DOGE_USER, DOGE_PASS);
rClient.on("error", function (err) { console.log("REDIS Error: " + err); }); 
botrepl.context.dogecoin=dogecoin;
botrepl.context.bot = bot;
botrepl.context.redis = rClient;

//for fun

bot.on("roomJoin", function(room){ 
    refreshRedis();
});

bot.on("userJoin", function(data){
    rClient.select(0);
    rClient.set(data.username,data.id);
    rClient.select(1);
    rClient.set(data.id,data.username);
});

bot.on("userLeave", function(data){
    var byeName;
    rClient.select(1);
    rClient.get(data.id,function(err,reply){byeName=reply;});
    rClient.expire(data.id,3);
    rClient.select(0);  
    rClient.expire(byeName,2);
});

// only used for REPL console trace.
bot.on("chat", function(data){ console.log(data.from + ": " + data.message) });

bot.on("djAdvance", function(data){

    var usrname;
    if(typeof data['dj'] !== 'undefined'){
    	usrname = data.dj.user.username;
    }
    else {
        var curDJ = bot.getDJ()
        dj=(curDJ == null)?"":curDJ;
        if(typeof data['djs']=="undefined" || data['djs'].length == 0) {return;}
        currentDJ = {username:dj.username,id:dj.id};
        return;
    }
    currentDJ = {username:data.dj.user.username,id:data.dj.user.username};
    bot.sendChat("/me " + usrname +" playing " + data.media.title + " by " + data.media.author);
});


bot.on("roomChanged", function() {
	console.log("[+] Joined " + ROOM);



});

bot.on("command", function(data){
    //console.log(data);
    
    switch(data.command){
    case "clap":bot.sendChat(":clap: :clap: :clap: :clap: BRAVO!");break;
    case "moo":bot.sendChat(":cow: m0000000 :cow2:");break;
    case "roll":
        var num=0;
        if( data.args[0] == "" || data.args[0] == "d6")
            num = Math.floor(Math.random() * 6) + 1;
        else if(data.args[0] == "d20")
            num = Math.floor(Math.random() * 20) + 1;
        else{
            bot.sendChat('format is !roll or !roll d20');
            return;
        }
            
        bot.sendChat("you rolled a " + num);
        break;
    
    case "throw":
        if(data.args[0] != "rock" && data.args[0]!="paper"&&data.args[0]!="scissors") {
            bot.sendChat('throw rock, paper or scissors.');
            return;
        }
        var botThrow = Math.floor(Math.random() * 3), // 0-rock,1-paper,2-scissors
            w = data.args[0],
            v = ['rock','paper','scissors'],
            usrThrow = (w=="rock")?0:(w=="paper")?1:w=="scissors"?2:null;
        if(botThrow==usrThrow){
            bot.sendChat('both threw '+w+' - tie!');
        }
        else if((botThrow==0 && usrThrow == 2) || botThrow -1 == usrThrow)
            bot.sendChat('bot won with ' + v[botThrow]);
        else if(usrThrow -1 == botThrow || (botThrow == 2 && usrThrow == 0))
            bot.sendChat('bot threw ' + v[botThrow] + '. you win!');
        break;
            

    case "balance": 
        dogecoin.exec('getBalance',data.message.fromID,
            function(err,balance){
                bot.sendChat(data.message.from+"'s balance is " + balance);
            }
        )
        //bot.sendChat();
        break;
    case "tip":
        tipDoge(data.message.fromID,data.message.from,data.args[0],data.args[1]);
        break;
	case "deposit":
        depositDoge(data.message.fromID, data.message.from);
        break;
    case "withdraw":
        withdrawDoge(data.message.fromID,data.args[0],data.args[1]);       
        break;
    case "":break;
    case "commands": bot.sendChat('commands are: !deposit, !withdraw, !tip, !balance');break;
        
    //default: bot.sendChat(data.message.from+' ' + insult[Math.floor(Math.random()*insult.length)]);

    }
    
});

// TIPPING FUNCTIONS...


function refreshRedis(){
    var users = bot.getUsers();
    rClient.select(0);
    for(var i=0;i<users.length;i++){
        /*

        rClient.get(users[i].username, function(err,reply){
            console.log('getuser err,reply: ' + err + ", " + reply);
        });

        */

        rClient.set(users[i].username,users[i].id);

    }
    rClient.select(1);
    for(var i=0;i<users.length;i++){

        rClient.set(users[i].id,users[i].username);

    }
}

function tipDoge(userID, username, recipient, amt, refresh){

    console.log('amt: ' + amt + " " + typeof amt);        

    // !tip DJ xx to tip current DJ is buggy at the moment.

    // var tipType = 0; //0:tip user, 1:tip dj, 2:host 
    /* if(recipient.toLowerCase() == "dj"){ recipient = currentDJ.username; tipType=1;}*/

    // CHECK FORMAT...

    if(recipient==''|| recipient == null || amt=='' || amt==null){
        bot.sendChat("format is: !tip [username] [amount]");
        return;
    }

    var tipamt = Math.floor(parseFloat(amt));

    // RETRIEVE sender's USERID, USING USERNAME

    rClient.select(0); // select username -> userid database 
    rClient.get(recipient,function(err,recipientID){

        if(err || recipientID == null){ // username /id pair does not exist
            if(typeof refresh === 'undefined'){
                refreshRedis();

                // refresh is true, so if it errors next time, they arent a real user.
                tipDoge(userID,username,recipient,amt,true); 
                return;
            } 
            bot.sendChat(recipient + ' is not in the room.');
            return;

        }else{
            if (isNaN(tipamt)){ bot.sendChat("tip amount is not valid"); return; }
            if( tipamt <= 0) { bot.sendChat("NO YOU CANT DO THAT");return;}
            dogecoin.exec('getbalance', userID, function(err, bal){
                if(bal<tipamt){
                    bot.sendChat('insufficient Balance, ' + username);
                    return;
                }

                dogecoin.move(userID,recipientID,tipamt,function(err,moveinfo){
                    bot.sendChat(username + ' tipped '+ recipient + " " + tipamt + " doge!");
                });
            });
        }
    });
}

function withdrawDoge(userID, destWallet){
    //var wallet;

    //FIXME

    dogecoin.exec('getbalance',userID,
        function(err,balance){
            if(err){bot.sendChat('error.');return;}

            this.validateAddress(destWallet,
                function(err, results){
                    if(!results.isvalid){
                        console.log(results);
                        bot.sendChat('bad address. !withdraw [address]');
                        return;
                    }
                    // console.log('results:');console.log(results);
                    
                    var send_amt = balance - tx_fee;
                    if(send_amt <= 0){
                        bot.sendChat("too small to send!");
                        return;
                    }
                    this.sendfrom(userID,destWallet,parseFloat(send_amt),
                        function(err,info){
                            if (err){
                                console.log(err);
                                bot.sendChat('tx error. !withdraw [wallet address]');
                            }
                            console.log('info:'); console.log(info);
                            console.log('err:'); console.log(err);
                        }
                    );

                }
            );
        }
    );
}

function depositDoge(userID,username){
    var wallet;
    dogecoin.exec('getaddressesbyaccount',userID, function(err,info){
        if(info.length==0){
            //
            this.getNewAddress(userID, function(err,address){
                if(err!=null){
                    //connection.end();
                    return;
                }
                console.log(address);
                bot.sendChat(username+'\'s deposit wallet: ' + address);
            })
        }
        else{
            bot.sendChat(username+'\'s deposit wallet: ' + info[0]);
        }
    });
}

/*
TODO: tip song for creator
TODO: tip dj
*/

}).call(this)
