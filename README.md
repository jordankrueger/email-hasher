# email-hasher
A Python script which normalizes (to upper or lower case) a list of email addresses and then hashes it into the cryptographic functions of your choice. 

**This script was written by ChatGPT 4.0.**

## There's also a Mac app
Using PyInstaller, I've packaged this script with all the dependencies and libraries needed to run it into a MacOS application file. You can download that here. 

## Instructions for using the Python script
If you prefer the simplicity of the Python script, here's how to use it: 

1. **Install Python**: Download and install Python from the official website (https://www.python.org/downloads/mac-osx/). Make sure to select the checkbox "Add Python to PATH" during installation.
2. **Install a code editor**: Download and install a code editor like Visual Studio Code (https://code.visualstudio.com/download) or Sublime Text (https://www.sublimetext.com/download).
3. **Create a new project folder**: Create a new folder where you'll store your Python script, using Finder. Name it something like "EmailHasher".
4. **Add the Python script to your folder**: Copy the Python script from this Git archive. In your code editor, create a new file and paste the code into it. Save the file as ``email_hasher.py`` in the folder you just created. 
5. **Install pandas and hashlib**: Open Terminal (you can search for it using Spotlight) and navigate to your project folder using the cd command, e.g., `cd /path/to/EmailHasher` You can use the ``ls`` (list) command to list the items in the directory you're in, so you know which folders to navigate through to get to your project folder. Then, run the commands below to install the required libraries. (Copy and paste each of them into your terminal one at a time, pushing return after pasting each and waiting for the command line to return before entering the next.)
```
python3 -m pip install --upgrade pip
```
```
python3 -m pip install pandas
```
6. *Optional* **Install the SHA-3 encryption library**: If you plan on encrypting using SHA-3, you'll need to also run the following command: 
```
python -m pip install pycryptodome
```
7. **Run the script**: Use the command below to open a very simple graphical user interface that asks you for the file you wish to hash, where you want that file to be output, which encryption method you want to use, and whether you want to normalize your emails to upper or lower case. 
```
python3 email_hasher.py
```
Once the script runs, you'll find a CSV file with the hashed email list in the project folder. 
