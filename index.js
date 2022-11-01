const puppeteer = require("puppeteer");
const cloudinary = require("cloudinary");
require('dotenv').config()

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const todayISOString = new Date().toISOString().slice(0, 10);

(async () => {
  try {
    const browser = await puppeteer.launch({args: ['--no-sandbox', '--disable-setuid-sandbox']});
    const page = await browser.newPage();
    await page.goto(
      "https://woocenter.azurewebsites.net/Identity/Account/Login?ReturnUrl=%2FTask%2FIndex"
    );
    await page.type("#Input_UserName", process.env.WOOCOMMERCE_USER);
    await page.type("#Input_Password", process.env.WOOCOMMERCE_PW);

    await page.click(".btn-success");

    await page.waitForNavigation();

    await page.click('input[value="CompletedTasks"]');
    await page.waitForResponse(
      "https://woocenter.azurewebsites.net/Task/ListTask"
    );
    await page.waitForNetworkIdle();
    const dataIds = await page.$$eval("button[data-id]", async (buttons) => {
      return buttons
        .map((button) => button.dataset.id)
        .filter((value) => value != -1);
    });

    const dailyPackages = [];
    for (const id of dataIds) {
      const images = [];
      try {
        await page.click(`button[data-id="${id}"]`);
        page.on("response", (response) => {
          if (response.url().endsWith(".jpeg")) {
            images.push(response.url());
          }
        });
        await page.waitForNetworkIdle();
        const name = await page.$eval("input.ac-name-2", (ele) => ele.value);
        const orderId = await page.$eval(
          "input[name='ExternalKey']",
          (ele) => ele.value
        );
        await page.$$eval('button[data-dismiss="modal"]', (nodeList) => {
          for (const ele of nodeList) {
            if (ele.offsetParent !== null) {
              ele.click();
              break;
            }
          }
        });
        dailyPackages.push({ name, orderId, images: [...images] });
        await page.waitForNetworkIdle();
      } catch (err) {
        return "error";
      }
    }
    await browser.close();
    for (const order of dailyPackages) {
      for (const image of order.images) {
        cloudinary.v2.uploader.upload(
          image,
          {
            overwrite: false,
            folder: `${todayISOString}/${order.orderId}_${order.name.replace(
              " ",
              "_"
            )}`,
          },
          function (error, result) {
            // console.log(result);
          }
        );
      }
    }
    console.log(`image upload for ${dailyPackages.length} daily packages completed.`)
  } catch (error) {
    console.log(error);
  }
})();
