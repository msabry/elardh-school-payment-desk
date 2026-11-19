# Elardh School Payment Desk

build a simple web app app that will be used for finance team collections of school fees .

it should be usable from mobile (mobile friendly)



it should be an interface for a google sheet and a @connector:google_drive:"Google Drive" folder.



accountant 1 will select a customer (by typing first letters in a box) , then select child name , then select program/course name , then input collection amount, then attach transfer reference.



accountant 2 will select customer too , then input collection amount, then paste confirmation sms text .

the database (google sheet) should hold master data like customer id , customer name , kid name (where each customer can have several kids) , program/course id , program/course name (each kid might subscribe to several courses).



it also should record transaction id (auto generated) , transaction date (generated).

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://elardh-school-payment-desk.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/bb87f08b-ac18-4cad-9b49-8f76a1896f49).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
