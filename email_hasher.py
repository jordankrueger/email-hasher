import sys
import tkinter as tk
from tkinter import filedialog
import pandas as pd
import hashlib
from Crypto.Hash import SHA3_256, SHA3_512

def hash_email(email, algorithm, case):
    email = email.strip()
    email = email.lower() if case == 'lower' else email.upper()
    email = email.encode('utf-8')
    
    if algorithm == 'md5':
        return hashlib.md5(email).hexdigest()
    elif algorithm == 'sha1':
        return hashlib.sha1(email).hexdigest()
    elif algorithm == 'sha256':
        return hashlib.sha256(email).hexdigest()
    elif algorithm == 'sha512':
        return hashlib.sha512(email).hexdigest()
    elif algorithm == 'sha3_256':
        return SHA3_256.new(email).hexdigest()
    elif algorithm == 'sha3_512':
        return SHA3_512.new(email).hexdigest()
    else:
        raise ValueError(f"Unsupported algorithm: {algorithm}")

def main(input_file, output_file, algorithm, case):
    df = pd.read_csv(input_file)
    df['hashed_email'] = df['email'].apply(lambda x: hash_email(x, algorithm, case))
    df.to_csv(output_file, index=False)

def browse_input_file():
    input_file = filedialog.askopenfilename(filetypes=[("CSV Files", "*.csv")])
    input_file_label.config(text=input_file)
    return input_file

def browse_output_file():
    output_file = filedialog.asksaveasfilename(defaultextension=".csv", filetypes=[("CSV Files", "*.csv")])
    output_file_label.config(text=output_file)
    return output_file

def process_file():
    algorithm = algorithm_var.get()
    case = case_var.get()
    main(input_file_label['text'], output_file_label['text'], algorithm, case)
    status_label.config(text="Hashing complete!")

root = tk.Tk()
root.title("Email Hasher")

algorithm_var = tk.StringVar()
algorithm_var.set("sha256")

case_var = tk.StringVar()
case_var.set("lower")

input_file_label = tk.Label(root, text="")
output_file_label = tk.Label(root, text="")

input_button = tk.Button(root, text="Select Input File", command=browse_input_file)
input_button.pack()

input_file_label.pack()

output_button = tk.Button(root, text="Select Output File", command=browse_output_file)
output_button.pack()

output_file_label.pack()

algorithm_label = tk.Label(root, text="Select Algorithm")
algorithm_label.pack()

algorithm_optionmenu = tk.OptionMenu(root, algorithm_var, "md5", "sha1", "sha256", "sha512", "sha3_256", "sha3_512")
algorithm_optionmenu.pack()

case_label = tk.Label(root, text="Select Case")
case_label.pack()

case_optionmenu = tk.OptionMenu(root, case_var, "lower", "upper")
case_optionmenu.pack()

hash_button = tk.Button(root, text="Hash Emails", command=process_file)
hash_button.pack()

status_label = tk.Label(root, text="")
status_label.pack()

root.mainloop()