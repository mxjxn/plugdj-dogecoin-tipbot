(function() {
/**
 *
 * DOGECOIN TIP BOT for Plug.dj. 
 * written by Max Jackson ( moncrey )
 * relies on Redis and dogecoin running in the background.
 *
 **/


// Load config files
var nconf = require('nconf'),
misc = require('./commands');

nconf.file("config.json")
    .file("secret_config.json")
    .defaults({
        "doge":{"user":false,"pass":false},
        "plug":{"auth":false,"room":false}
    });

// Set important variables from config files.
var AUTH = nconf.get('plug:auth'),
ROOM = nconf.get('plug:room'),
DOGE_USER = nconf.get("doge:user"),
DOGE_PASS = nconf.get("doge:pass"),
insult = nconf.get('insult'),
tx_fee = nconf.get('tx_fee'),

PlugAPI = require('plugapi'),
bot = new PlugAPI(AUTH),

currentDJ="";

if(!AUTH || !ROOM){
    console.log('missing config, cannot load bot');
    return false;
}

/* REDIS STUFF, used to keep track of username <--> id relationships */
var redis = require('redis'),
rClient = rClient || redis.createClient(),

/* node REPL for behind the scenes tweaks */
repl = require('repl'),
botrepl = repl.start("bot>"),

/* DOGECOIN */
dogecoin = require('node-dogecoin')();

// INITIALIZE BOT,DOGE,REDIS

bot.connect(ROOM);
dogecoin.auth(DOGE_USER, DOGE_PASS);

// make repl references to important variables
botrepl.context.dogecoin=dogecoin;
botrepl.context.bot = bot;
botrepl.context.redis = rClient;

rClient.on("error", function (err) { console.log("REDIS Error: " + err); }); 


/*
 * PLUG.DJ EVENT RESPONDERS
 */

/* event roomChanged -- when the bot enters a room */
bot.on("roomChanged", function() {
	console.log("[+] Joined " + ROOM);
});

/* event roomJoin -- when the bot is fully connected */
bot.on("roomJoin", function(room){ 
    refreshRedis();
    console.log('room joined.');
});

/* event userJoin -- someone else has entered the current room */
bot.on("userJoin", function(data){
    rClient.select(0);
    rClient.set(data.username,data.id);
    rClient.select(1);
    rClient.set(data.id,data.username);
});

/* event userLeave -- a user has left the current room */
bot.on("userLeave", function(data){
    var byeName;
    rClient.select(1);
    rClient.get(data.id,function(err,reply){byeName=reply;});
    rClient.expire(data.id,3);
    rClient.select(0);  
    rClient.expire(byeName,2);
});

/* event chat -- event fires whenever someone chats in the room */
bot.on("chat", function(data){ console.log(data.from + ": " + data.message) });

/* event djAdvance -- fires between songs, when a user joins an empty queue or when a user leaves the deck, leaving the queue empty */
bot.on("djAdvance", function(data){
    var usrname;
    //conditional because of varying json formatting.
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

/* event command -- triggered when the command delimiter is the first character in a new chat line. '.' (period) by default */
bot.on("command", function(data){
    switch(data.command){
        case "clap": 
            bot.sendChat(":clap: :clap: :clap: :clap: BRAVO!");
            break;
        case "moo": 
            bot.sendChat(":cow: m0000000 :cow2:");
            break;
        case "roll":
            var rollResult = misc.roll(data.args[0]);
            bot.sendChat(rollResult);
            break;
        case "throw": //paper rock or scissors
            var rpsResult = misc.rockPaperScissors(data.args[0]);
            bot.sendChat(rpsResult);
            break;
        case "balance": 
            dogeBalance(data.message.fromID, data.message.from);
            break;
        case "tip":
            tipDoge(data.message.fromID, data.message.from, data.args[0], data.args[1]);
            break;
        case "deposit":
            depositDoge(data.message.fromID, data.message.from);
            break;
        case "withdraw":
            withdrawDoge(data.message.fromID, data.args[0], data.args[1]);       
            break;
        case "commands": 
            bot.sendChat('commands are: !deposit, !withdraw, !tip, !balance');
            break;
        case "":break;  
        default: 
            bot.sendChat(data.message.from+' ' +insult[Math.floor(Math.random()*insult.length)]);
    }
});

/* Function refreshRedis
 * if the bot has joined a new room, we need to refresh the userid <--> username database.
 * due to a flaw in the plugapi, this also needs to be called if someone changes their username while in the room. 
 **/
function refreshRedis(){
    var users = bot.getUsers();
    rClient.select(0);
    for(var i=0;i<users.length;i++){
        rClient.set(users[i].username,users[i].id);
    }
    rClient.select(1);
    for(var i=0;i<users.length;i++){
        rClient.set(users[i].id,users[i].username);
    }
}

/* Dogecoin tipping functions. */

function dogeBalance(fromID,from){
    dogecoin.exec('getBalance',fromID,
        function(err,balance){
            bot.sendChat(from+"'s balance is " + balance);
        }
    )
}

function tipDoge(userID, username, recipient, amt, refresh){
    if(recipient==''|| recipient == null || amt=='' || amt==null){
        bot.sendChat("format is: !tip [username] [amount]");
        return;
    }
    
    var tipamt = Math.floor(parseFloat(amt));
    rClient.select(0); // selects username -> userid database 
    rClient.get(recipient, function(err,recipientID){ // check for a userID matching username
        
        if(err || recipientID == null){ // if username /id pair does not exist, refresh redis and call this function again.
            if(typeof refresh === 'undefined'){
                refreshRedis();
                // next time refresh is true, so if it errors next time, we know they arent a real user.
                tipDoge(userID,username,recipient,amt,true); 
                return;
            } 
            bot.sendChat(recipient + ' is not in the room.');
            return;
        }else{ // userID is found. check for invalid values before tipping.
            if(isNaN(tipamt)){ bot.sendChat("tip amount is not valid"); return; }
            if(tipamt <= 0) { bot.sendChat("NO YOU CANT DO THAT");return;}
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
    
    //TODO: replace with chaining syntax to do away with nested function calls. 

    // flow: check balance, validate destination wallet, send balance.
    
    dogecoin.exec('getbalance',userID,
        function(err,balance){
            if(err){return;}

            this.validateAddress(destWallet,
                function(err, results){
                    if(!results.isvalid){
                        console.log(results);
                        bot.sendChat('bad address. !withdraw [address]');
                        return;
                    }

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
        if(info.length==0){ // if no addresses associated with this ID, create one
            this.getNewAddress(userID, function(err,address){
                if(err!=null){ return }
                bot.sendChat(username+'\'s deposit wallet: ' + address);
            })
        }
        else{
            bot.sendChat(username+'\'s deposit wallet: ' + info[0]);
        }
    });
}

}).call(this)
