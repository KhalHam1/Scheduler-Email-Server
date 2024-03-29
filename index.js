
//Creating the server 
const fs = require("fs");
const cors = require("cors");
const express = require("express");
//THIS APPROACH works for all os, to obtain theproject folder
const path = require('path');  //import the module path

const rootDirectory = path.dirname(require.main.filename ); //returns the directory name of the file that is running aka "app.js" parent folder

const nodemailer = require("nodemailer");
const multer = require("multer"); //for handleing Multipart forms ONLY
const {google} = require("googleapis");


const { getDBRefValues, isAdmin, deleteUser, editUserAccount, editMyAccount, userExist } = require('./firebase');
const { isStringObject } = require("util/types");
require("dotenv").config();

// to update the node mai with a refresh token each time an email is sending
const OAuth2 = google.auth.OAuth2;  
const oauth2Client = new OAuth2(
    process.env.OAUTH_CLIENT_ID,
    process.env.OAUTH_CLIENT_SECRET,
    "https://developers.google.com/oauthplayground"
);

var access_token = process.env.OAUTH_ACCESS_TOKEN
// set auth as a global default
google.options({
    auth: oauth2Client
});

oauth2Client.setCredentials({
    refresh_token: process.env.OAUTH_REFRESH_TOKEN,
});

 const getNewAccessToken = async( )=>{ 
     console.log('Running getNewAccessToken()...')
    return await new Promise( (resolve, reject) => {
        //here we authenticate ourselve to get a refreshToken using our accessToken
        oauth2Client.getAccessToken( (err, token) =>{
            if(err){
                reject("Failed to create access token :( " + err);
            }
            //oauth2Client.setCredentials({})
            process.env.OAUTH_ACCESS_TOKEN = token
            console.log('New Token ', token)
            resolve(token);
        });
    }) 
}


//createTransporter to connect to the playground
const createTransporter = async () =>{
    //connects our application to Google Playground: used for updating refreshToken
    // const oauth2Client = new OAuth2(
    //     process.env.OAUTH_CLIENT_ID,
    //     process.env.OAUTH_CLIENT_SECRET,
    //     "https://developers.google.com/oauthplayground"
    // );

    // // set auth as a global default
    // google.options({
    //     auth: oauth2Client
    // });
    
    // oauth2Client.setCredentials({
    //     refresh_token: process.env.OAUTH_REFRESH_TOKEN,
    // });
    
    // oauth2Client.getAccessToken()
    // oauth2Client.on('tokens', (tokens) => {
    //     if (tokens.refresh_token) {
    //       // store the refresh_token in my database!
    //       console.log("OAuth2Client Access Token",tokens.refresh_token);
    //     }
    //     console.log(tokens.access_token);
    //   });

    // const accessToken = await new Promise( (resolve, reject) =>{
    //     //here we authenticate ourselve to get a refreshToken using our accessToken
    //     oauth2Client.getAccessToken( (err, token) =>{
    //         if(err){
    //             reject("Failed to create access token :( " + err);
    //         }
    //         //oauth2Client.setCredentials({})
    //         resolve(token);
    //     });
    // } );

    //console.log('\n\n\nAccess Token', accessToken)
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            // type: 'login',
            // user : process.env.SENDER_EMAIL,
            // pass: 'F@1ryt@1l'
            type: "OAuth2",
            user: process.env.SENDER_EMAIL,
            accessToken : access_token,
            clientId: process.env.OAUTH_CLIENT_ID,
            clientSecret: process.env.OAUTH_CLIENT_SECRET,
            refreshToken: process.env.OAUTH_REFRESH_TOKEN,
            //accessUrl: 'https://developers.google.com/oauthplayground'
        }
    });
    
    console.log('\n\n\nAFTER \n\n')
    transporter.on('token', token => {
        console.log('\n\nA new access token was generated');
        console.log('User: %s', token.user);
        console.log('Access Token: %s', token.accessToken);
        console.log('Expires: %s', new Date(token.expires));
    });
    transporter.set('oauth2_provision_cb',(user, renew)=>{
        console.log("Calling oauth2 callback", user, renew)
        if( renew ){
            console.log('NodeMail Token needs refreshing for ' + user)
            let newToken = getNewAccessToken()
            console.log( 'Generated new Token: ', newToken == access_token)
            
            if( isStringObject(newToken) && !newToken.includes('invalid') )
                access_token = newToken
            return access_token
        }
    })
    return transporter;
};





//creating an instance of express function
const app= express();
app.use(cors());
const port = process.env.PORT || 3000;


//Set a storage engien to store recieved files locally
const Storage = multer.diskStorage({
    destination: function(req, file, callback){
        //call back( error, destination)
        if ( file )
        callback(null, path.join(rootDirectory, "attachments", ));
    },
    filename: function (req, file, callback){
        //callback( error, fileName)
        if ( file )
        callback(null, `${Date.now()}_${file.originalname}`);
    }
});

const attachmentUpload = multer({
    storage: Storage,
}).single("attachment")  //name of multipart form field to process 

//To remove file off the server
function deleteUploadedFile(attachmentPath){
    let filePath =  attachmentPath
    console.log(`File PAth to be deleted: ${filePath}`)
    fs.unlink( filePath, function(err){
        if(err)
            console.log(err);
        else
            console.log("File Removed from server!")

    })
}

//Alternative to installing body-parser & using:  app.use( bodyParser.urlencoded({extended:false}) );
app.use(express.json());
app.use(express.urlencoded({extended: false}));


app.get("/", (req, res)=>{
    //console.log( "requested From", req)
    res.send("Server is running!")
})

app.post("/type/user", async (req, res)=>{
    if(!req.body.currentUser )
        res.send({"error": "Invalid Request"})
    else{
        let check = await isAdmin(req.body.currentUser)
        res.send({"result" : check})
    }
})

//Allows and adminstrator to edit any User account
app.post('/edit/user', async (req, res)=>{
    //console.log(req)
    if( !req.body.userData || !req.body.currentUser || !req.body.userData.userToUpdate )
        res.send({"error": "Invalid Request"})
    else {
        try{
            let check = await isAdmin(req.body.currentUser)
            if( check==false ) res.send({"error": "User not authorized to edit accounts!"}) 
            else if(check){
                let edited = await editUserAccount(req.body.userData)
                if( !edited ) res.send({"error": "Failed to edit User"}) 
                else if (edited) res.send({"message": "User account edit!"}) 
            }
        }
        catch(error){
            console.log(`Error occured in 'edit/user' route: ${error}`)
            res.send({"error": "Failed to edit User"}) 
        }
    }
    

})


app.post('/edit/myaccount', async (req, res)=>{
    //console.log(req)
    if( !req.body.userToUpdate )
        res.send({"error": "Invalid Request"})
    else {
        try{
            let check = await userExist(req.body.userToUpdate)
            if( check==false ) res.send({"error": "User account not found!"}) 
            else if(check){
                let edited = await editMyAccount(req.body)
                if( !edited ) res.send({"error": "Failed to edit User Account!"}) 
                else if (edited) res.send({"message": "User account edit!"}) 
            }
        }
        catch(error){
            console.log(`Error occured in 'edit/myaccount' route: ${error}`)
            res.send({"error": "Failed to edit User"}) 
        }
    }
    

})


//allows the admin to delete any user
app.post('/delete/user', async (req, res)=>{
    //console.log(req)
    if( !req.body.userToDelete || !req.body.currentUser)
        res.send({"error": "Invalid Request"})
    else {
        try{
            let check = await isAdmin(req.body.currentUser)
            if( check==false ) res.send({"error": "User not authorized to delete accounts!"}) 
            else if(check){
                let deleted = await deleteUser(req.body.userToDelete)
                if( !deleted ) res.send({"error": "Failed to deleted User"}) 
                else if (deleted) res.send({"message": "User deleted!"}) 
            }
        }
        catch(error){
            console.log(`Error occured in delete route: ${error}`)
            res.send({"error": "Failed to deleted User"}) 
        }
    }
    

})

app.post("/send_email",  (req, res)=>{
    //console.log(req)
    
    attachmentUpload( req, res, async function(error){
        if (error){
            console.log(error);
            return res.send("Error uploading file");
        } else if( !req.body.message || !req.body.subject ) res.send(`{"error": "Invalid request. Please Ensure all necessary variables are added." }`)
        else{
            const fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
            let recipient = "jeremiahstrong321@gmail.com";  //default recipient
            let name = "Assessment Scheduler App";  //default name 
            let isDefaultEmail = true

            if( req.body.recipient != null ){ 
                name =  req.body.name;
                recipient = await getDBRefValues(`users/${req.body.recipient}/email`) ||  recipient //email admin if invalid request
            }
                
            //If the sender is not present 
            const sender =`Assessment Scheduler App Notification<${process.env.SENDER_EMAIL}>`;
            const subject = req.body.subject;
            const message =   req.body.message ;
            let attachmentPath = null;

    
            console.log("\nrecipient:", recipient);
            console.log("subject:", subject);
            console.log("message:", message);
            
            
    
            //email option
            let mailOptions = {
                from : sender,
                to: recipient,
                subject: subject,
                text: message,
                attachments: []
            };

            if ( req.file ){
                attachmentPath = req.file.path;
                console.log("attachmentPath:", attachmentPath);
                mailOptions.attachments = [{
                    path: attachmentPath,
                }]
            }
            
           try{
                    //To send out email
                let emailTransporter = await createTransporter();
                
                emailTransporter.sendMail(mailOptions, function(err, data){
                    if(err){
                        console.log(`Error while attempting to send email: ${err}`)
                        return res.send(`{"error": "Failed to send email to ${recipient}." }`)
                    }
                    else{
                        console.log(`\n\nData: ${JSON.stringify(data)}`)
                        if(attachmentPath !=null)
                            deleteUploadedFile(attachmentPath)
                        console.log("Email sent successfully!");
                        return res.send(`{"message": "Email sent successfully to ${recipient}" }`)
                    }
                });
    
           } catch(error){
                console.log(error);
                return res.send(`{"error": "Failed to send email to ${recipient}." }`)

           }
    
        } //end of first else
    }) //end of attachmentUpload

}) //end of post method

app.listen(port, ()=>{
    console.log(`Server is runnning on port ${port} from ${rootDirectory}`)
})
